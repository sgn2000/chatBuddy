import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, doc, onSnapshot, updateDoc, deleteDoc, setDoc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Subject } from 'rxjs';

export interface Call {
    id?: string;
    groupId: string;
    callerId: string;
    calleeId?: string; // Null for group broadcast (initially)
    status: 'offering' | 'answered' | 'ended';
    offer?: any;
    answer?: any;
}

@Injectable({
    providedIn: 'root'
})
export class CallService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    remoteStream$ = new BehaviorSubject<MediaStream | null>(null);
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

    async startCall(groupId: string, callerId: string) {
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
            offer: {
                type: offerDescription.type,
                sdp: offerDescription.sdp
            }
        };

        await setDoc(callDocRef, call);
        this.activeCall$.next(call);

        // Listen for Answer
        onSnapshot(callDocRef, (snapshot) => {
            const data = snapshot.data() as Call;
            if (data && data.answer && !this.peerConnection!.currentRemoteDescription) {
                const answerDescription = new RTCSessionDescription(data.answer);
                this.peerConnection!.setRemoteDescription(answerDescription);
                this.callStatus$.next('connected');
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
    }

    async endCall() {
        const call = this.activeCall$.value;
        if (call && call.id) {
            // Try to delete or update status
            try {
                const callDocRef = doc(this.firestore, `calls/${call.id}`);
                await deleteDoc(callDocRef); // Or update status to 'ended'
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

        this.peerConnection.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                this.remoteStream$.next(event.streams[0]);
            });
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

    private cleanup() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.remoteStream$.next(null);
        this.activeCall$.next(null);
        this.incomingCall$.next(null);
        this.callStatus$.next('idle');
    }
}
