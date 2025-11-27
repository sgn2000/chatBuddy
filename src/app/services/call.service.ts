import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, doc, onSnapshot, updateDoc, deleteDoc, setDoc, getDoc, deleteField } from '@angular/fire/firestore';
import { BehaviorSubject, Subject } from 'rxjs';

export interface Call {
    id?: string;
    groupId: string;
    callerId: string;
    calleeId?: string; // Null for group broadcast (initially)
    status: 'offering' | 'answered' | 'ended';
    type?: 'regular' | 'theatre'; // 'regular' is default if undefined
    offer?: any;
    answer?: any;
}

@Injectable({
    providedIn: 'root'
})
export class CallService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private screenShareStream: MediaStream | null = null;

    remoteStream$ = new BehaviorSubject<MediaStream | null>(null);
    remoteScreenShare$ = new BehaviorSubject<MediaStream | null>(null);
    screenShareStream$ = new BehaviorSubject<MediaStream | null>(null);
    isScreenSharing$ = new BehaviorSubject<boolean>(false);

    incomingCall$ = new BehaviorSubject<Call | null>(null);
    activeCall$ = new BehaviorSubject<Call | null>(null);
    callStatus$ = new BehaviorSubject<string>('idle'); // idle, calling, connected, incoming

    private servers = {
        iceServers: [
            {
                urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
            }
        ]
    };

    constructor(private firestore: Firestore) { }

    async startCall(groupId: string, callerId: string, type: 'regular' | 'theatre' = 'regular') {
        this.callStatus$.next('calling');
        await this.initPeerConnection();

        // Create Call Document
        const callDocRef = doc(collection(this.firestore, 'calls'));
        const callId = callDocRef.id;

        this.listenForIceCandidates(callId, 'caller');

        const offerDescription = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offerDescription);

        const call: Call = {
            id: callId,
            groupId,
            callerId,
            status: 'offering',
            type,
            offer: {
                type: offerDescription.type,
                sdp: offerDescription.sdp
            }
        };

        await setDoc(callDocRef, call);
        this.activeCall$.next(call);

        // Listen for Answer (including renegotiation answers)
        onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data() as Call;
            if (data && data.answer) {
                // Set remote description if we don't have one, or if we're renegotiating
                if (!this.peerConnection!.currentRemoteDescription || this.peerConnection!.signalingState !== 'stable') {
                    console.log('Setting remote description from answer');
                    const answerDescription = new RTCSessionDescription(data.answer);
                    await this.peerConnection!.setRemoteDescription(answerDescription);
                    this.callStatus$.next('connected');
                }
            }
        });
    }

    listenForIncomingCalls(groupId: string, userId: string) {
        // Simplified: Listen to all calls in group, filter for "offering" status
        // In production, you'd query better.
        const callsCollection = collection(this.firestore, 'calls');
        onSnapshot(callsCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const call = change.doc.data() as Call;
                call.id = change.doc.id;

                if (change.type === 'added' && call.groupId === groupId && call.status === 'offering' && call.callerId !== userId) {
                    console.log('Incoming call:', call);
                    this.incomingCall$.next(call);
                    this.callStatus$.next('incoming');
                }
            });
        });
    }

    async answerCall(call: Call) {
        this.incomingCall$.next(null);
        this.callStatus$.next('connecting');
        this.activeCall$.next(call);
        await this.initPeerConnection();

        const callId = call.id!;
        this.listenForIceCandidates(callId, 'callee');

        const callDocRef = doc(this.firestore, `calls/${callId}`);
        const offerDescription = call.offer;
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp
        };

        await updateDoc(callDocRef, { answer, status: 'answered' });
        this.callStatus$.next('connected');

        // Listen for offer updates (renegotiation)
        onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data() as Call;
            // Only process new offers if we are stable (ready for new offer) and the offer is actually different
            if (data && data.offer && this.peerConnection!.signalingState === 'stable') {
                const currentRemoteSdp = this.peerConnection!.remoteDescription?.sdp;
                if (data.offer.sdp !== currentRemoteSdp) {
                    console.log('Received new offer during renegotiation');
                    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const newAnswer = await this.peerConnection!.createAnswer();
                    await this.peerConnection!.setLocalDescription(newAnswer);
                    await updateDoc(callDocRef, {
                        answer: {
                            type: newAnswer.type,
                            sdp: newAnswer.sdp
                        }
                    });
                    console.log('Sent new answer for renegotiation');
                }
            }
        });
    }

    async endCall(userId?: string) {
        const call = this.activeCall$.value;
        if (call && call.id) {
            try {
                const callDocRef = doc(this.firestore, `calls/${call.id}`);

                // If userId is provided and matches callerId, it's the host ending the call
                // If no userId provided, assume it's a destructive end (legacy behavior)
                if (!userId || call.callerId === userId) {
                    console.log('Host ending call, deleting document');
                    await deleteDoc(callDocRef);
                } else {
                    // Viewer leaving, reset status to offering so they can join again
                    console.log('Viewer leaving call, resetting to offering');
                    await updateDoc(callDocRef, {
                        status: 'offering',
                        answer: deleteField()
                    });
                }
            } catch (e) {
                console.error("Error ending call doc", e);
            }
        }

        this.cleanup();
    }

    private async initPeerConnection() {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        this.peerConnection = new RTCPeerConnection(this.servers);

        this.localStream.getTracks().forEach((track) => {
            this.peerConnection!.addTrack(track, this.localStream!);
        });

        // Handle renegotiation when new tracks are added (e.g., screen share)
        this.peerConnection.onnegotiationneeded = async () => {
            try {
                const call = this.activeCall$.value;
                if (!call || !call.id) return;

                console.log('Renegotiation needed, creating new offer');
                const offerDescription = await this.peerConnection!.createOffer();
                await this.peerConnection!.setLocalDescription(offerDescription);

                const callDocRef = doc(this.firestore, `calls/${call.id}`);
                await updateDoc(callDocRef, {
                    offer: {
                        type: offerDescription.type,
                        sdp: offerDescription.sdp
                    }
                });
                console.log('New offer sent for renegotiation');
            } catch (error) {
                console.error('Error during renegotiation:', error);
            }
        };

        this.peerConnection.ontrack = (event) => {
            const stream = event.streams[0];
            const track = event.track;

            console.log('Received track:', track.kind, track.label);

            // Differentiate between regular call stream and screen share stream
            // Screen share has video track, regular audio call doesn't
            if (track.kind === 'video') {
                // This is a screen share track (video)
                this.remoteScreenShare$.next(stream);
                console.log('Received remote screen share stream');
            } else {
                // Regular audio call track
                this.remoteStream$.next(stream);
                console.log('Received remote audio stream');
            }
        };
    }

    private listenForIceCandidates(callId: string, role: 'caller' | 'callee') {
        const candidatesCollection = collection(this.firestore, `calls/${callId}/candidates`);

        // Send local candidates
        this.peerConnection!.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(candidatesCollection, event.candidate.toJSON());
            }
        };

        // Listen for remote candidates
        onSnapshot(candidatesCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    this.peerConnection!.addIceCandidate(candidate);
                }
            });
        });
    }

    private async renegotiate() {
        try {
            const call = this.activeCall$.value;
            if (!call || !call.id) {
                console.error('Cannot renegotiate: no active call');
                return;
            }

            console.log('Manual renegotiation: creating new offer');
            const offerDescription = await this.peerConnection!.createOffer();
            await this.peerConnection!.setLocalDescription(offerDescription);

            const callDocRef = doc(this.firestore, `calls/${call.id}`);
            await updateDoc(callDocRef, {
                offer: {
                    type: offerDescription.type,
                    sdp: offerDescription.sdp
                }
            });
            console.log('Manual renegotiation: new offer sent');
        } catch (error) {
            console.error('Error during manual renegotiation:', error);
        }
    }

    async startScreenShare() {
        try {
            console.log('Starting screen share...');
            // Request screen share with audio
            this.screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true  // Capture system audio
            });

            console.log('Screen share stream obtained:', this.screenShareStream.getTracks().map(t => `${t.kind}: ${t.label}`));
            this.screenShareStream$.next(this.screenShareStream);
            this.isScreenSharing$.next(true);

            // Add screen share tracks to peer connection
            if (this.peerConnection) {
                console.log('Peer connection state:', this.peerConnection.connectionState, 'Signaling state:', this.peerConnection.signalingState);
                this.screenShareStream.getTracks().forEach((track) => {
                    console.log('Adding track to peer connection:', track.kind, track.label);
                    this.peerConnection!.addTrack(track, this.screenShareStream!);
                });
                console.log('All screen share tracks added to peer connection');

                // Manually trigger renegotiation (onnegotiationneeded doesn't always fire reliably)
                await this.renegotiate();
            } else {
                console.error('No peer connection available for screen share!');
            }

            // Handle when user stops sharing from browser UI
            this.screenShareStream.getVideoTracks()[0].onended = () => {
                this.stopScreenShare();
            };

            // Signal screen share start to Firebase
            const call = this.activeCall$.value;
            if (call && call.id) {
                const callDocRef = doc(this.firestore, `calls/${call.id}`);
                await updateDoc(callDocRef, { screenSharing: true });
                console.log('Updated Firebase with screenSharing: true');
            }

            console.log('Screen sharing started successfully');
        } catch (error) {
            console.error('Error starting screen share:', error);
            this.isScreenSharing$.next(false);
        }
    }

    async stopScreenShare() {
        if (this.screenShareStream) {
            // Stop all tracks
            this.screenShareStream.getTracks().forEach(track => track.stop());

            // Remove tracks from peer connection
            if (this.peerConnection) {
                const senders = this.peerConnection.getSenders();
                senders.forEach(sender => {
                    if (this.screenShareStream && this.screenShareStream.getTracks().includes(sender.track!)) {
                        this.peerConnection!.removeTrack(sender);
                    }
                });
            }

            this.screenShareStream = null;
            this.screenShareStream$.next(null);
            this.isScreenSharing$.next(false);

            // Signal screen share stop to Firebase
            const call = this.activeCall$.value;
            if (call && call.id) {
                const callDocRef = doc(this.firestore, `calls/${call.id}`);
                await updateDoc(callDocRef, { screenSharing: false });
            }

            console.log('Screen sharing stopped');
        }
    }

    private cleanup() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.screenShareStream) {
            this.screenShareStream.getTracks().forEach(track => track.stop());
            this.screenShareStream = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.remoteStream$.next(null);
        this.remoteScreenShare$.next(null);
        this.screenShareStream$.next(null);
        this.isScreenSharing$.next(false);
        this.activeCall$.next(null);
        this.incomingCall$.next(null);
        this.callStatus$.next('idle');
    }
}
