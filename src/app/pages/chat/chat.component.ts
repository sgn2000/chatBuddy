import { Component, OnInit, AfterViewChecked, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService, Message, ActiveUser } from '../../services/chat.service';
import { CallService, Call } from '../../services/call.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  messages: Message[] = [];
  activeUsers: ActiveUser[] = [];
  offlineUsers: any[] = [];
  currentUser = '';
  currentGroup = '';
  currentPasscode = '';
  newMessage = '';
  selectedFile: File | null = null;
  selectedFilePreview: string | null = null;
  showEmojiPicker = false;
  showActiveUsers = true;
  emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸'];

  viewMode = 'normal';
  unreadCount = 0;
  private previousMessageCount = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  callStatus = 'idle';
  incomingCall: Call | null = null;
  activeCall: Call | null = null;
  remoteStream: MediaStream | null = null;
  remoteScreenShare: MediaStream | null = null;
  isScreenSharing = false;
  showCallPage = false;
  showTheatreOverlay = false;
  theatreNotification: Call | null = null;
  isElectron = false;

  constructor(private chatService: ChatService, public callService: CallService, private router: Router) { }

  ngOnInit() {
    // Check if running in Electron
    this.isElectron = !!(window as any).electronAPI;

    this.chatService.currentUser$.subscribe(user => {
      if (!user) {
        this.router.navigate(['/']);
        return;
      }
      this.currentUser = user;
    });
    this.chatService.currentGroup$.subscribe(group => this.currentGroup = group);
    this.chatService.messages$.subscribe(msgs => {
      if (this.viewMode === 'bubble' && msgs.length > this.previousMessageCount) {
        const newMsgs = msgs.slice(this.previousMessageCount);
        const unread = newMsgs.filter(m => m.user !== this.currentUser).length;
        this.unreadCount += unread;
      }
      this.messages = msgs;
      this.previousMessageCount = msgs.length;
    });
    this.chatService.activeUsers$.subscribe(users => this.activeUsers = users);
    this.chatService.offlineUsers$.subscribe(users => this.offlineUsers = users);
    this.chatService.getActiveGroups().subscribe(groups => {
      const group = groups.find(g => g.groupName === this.currentGroup);
      if (group) {
        this.currentPasscode = group.passcode || '';
      }
    });

    if (window.electronAPI) {
      window.electronAPI.onViewModeChanged((mode) => {
        this.viewMode = mode;
        if (mode !== 'bubble') {
          this.unreadCount = 0;
        }
      });
    }

    // Call Service Subscriptions
    this.callService.callStatus$.subscribe(status => this.callStatus = status);
    this.callService.incomingCall$.subscribe(call => {
      if (call && call.type === 'theatre') {
        this.theatreNotification = call;
      } else {
        this.incomingCall = call;
      }
    });
    this.callService.activeCall$.subscribe(call => this.activeCall = call);
    this.callService.remoteStream$.subscribe(stream => {
      this.remoteStream = stream;
    });
    this.callService.remoteScreenShare$.subscribe(stream => {
      this.remoteScreenShare = stream;
    });
    this.callService.isScreenSharing$.subscribe(sharing => {
      this.isScreenSharing = sharing;
    });

    // Listen for incoming calls
    this.chatService.currentUser$.subscribe(user => {
      if (user && this.currentGroup) {
        this.callService.listenForIncomingCalls(this.currentGroup, user);
      }
    });
  }

  copyPasscode() {
    if (this.currentPasscode) {
      navigator.clipboard.writeText(this.currentPasscode).then(() => {
        alert('Passcode copied to clipboard!');
      });
    }
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.cleanupPresence();
  }

  private cleanupPresence() {
    if (this.currentGroup && this.currentUser) {
      this.chatService.removePresence(this.currentGroup, this.currentUser);
    }
  }

  scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  sendMessage() {
    if (this.newMessage.trim() || this.selectedFilePreview) {
      this.chatService.sendMessage(this.newMessage, this.selectedFilePreview || undefined);
      this.newMessage = '';
      this.removeAttachment();
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.selectedFilePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  removeAttachment() {
    this.selectedFile = null;
    this.selectedFilePreview = null;
  }

  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  toggleActiveUsers() {
    this.showActiveUsers = !this.showActiveUsers;
  }

  addEmoji(emoji: string) {
    this.newMessage += emoji;
  }

  toggleFloatingMode() {
    this.viewMode = 'bubble';
    setTimeout(() => {
      if (window.electronAPI) {
        window.electronAPI.toggleFloating();
      }
    }, 150);
  }

  expandBubble() {
    if (window.electronAPI) {
      window.electronAPI.expandBubble();
    }
  }

  collapseBubble() {
    if (window.electronAPI) {
      window.electronAPI.collapseBubble();
    }
  }

  leaveGroup() {
    this.cleanupPresence();
    this.router.navigate(['/']);
  }

  onMouseDown(event: MouseEvent) {
    if (this.viewMode === 'bubble') {
      this.isDragging = true;
      this.dragStartX = event.screenX;
      this.dragStartY = event.screenY;
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isDragging && this.viewMode === 'bubble') {
      const deltaX = event.screenX - this.dragStartX;
      const deltaY = event.screenY - this.dragStartY;

      if (window.electronAPI) {
        window.electronAPI.moveWindow(deltaX, deltaY);
      }

      this.dragStartX = event.screenX;
      this.dragStartY = event.screenY;
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isDragging = false;
  }

  handleBubbleClick(event: MouseEvent) {
    this.unreadCount = 0;
    this.expandBubble();
  }

  startCall() {
    if (this.currentGroup && this.currentUser) {
      this.showCallPage = true;
      this.callService.startCall(this.currentGroup, this.currentUser);
    }
  }

  answerCall(call?: Call) {
    const callToAnswer = call || this.incomingCall;
    if (callToAnswer) {
      this.callService.answerCall(callToAnswer);
      this.showCallPage = true;
      this.incomingCall = null;
    }
  }

  rejectCall() {
    this.incomingCall = null;
    this.callService.incomingCall$.next(null);
  }

  startScreenShare() {
    this.callService.startScreenShare();
  }

  stopScreenShare() {
    this.callService.stopScreenShare();
  }

  async startTheatreMode() {
    // Start the call FIRST to create the peer connection
    this.showCallPage = false;
    this.showTheatreOverlay = false;

    // Start the call to establish peer connection
    await this.callService.startCall(this.currentGroup, this.currentUser, 'theatre');

    // Wait a bit for the peer connection to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 500));

    // NOW start screen sharing (peer connection exists)
    await this.callService.startScreenShare();

    console.log('Theatre mode started: call established, screen sharing initiated');
  }

  joinTheatreMode() {
    if (this.theatreNotification) {
      this.callService.answerCall(this.theatreNotification);
      this.showTheatreOverlay = true; // Viewer DOES see the overlay
      this.showCallPage = false;
      this.theatreNotification = null;
    }
  }

  leaveTheatreMode() {
    this.endCall();
    this.showTheatreOverlay = false;
  }

  endCall() {
    this.callService.endCall(this.currentUser);
    this.showCallPage = false;
    this.showTheatreOverlay = false;
  }
}
