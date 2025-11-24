import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { Firestore, collection, addDoc, collectionData, query, where, doc, setDoc, deleteDoc } from '@angular/fire/firestore';

export interface Message {
  user: string;
  text: string;
  time: Date;
  group: string;
  isSystem?: boolean;
  attachment?: string; // Base64 string
}

export interface ActiveUser {
  username: string;
  group: string;
  lastSeen: Date;
}

export interface GroupInfo {
  id?: string; // Firestore Doc ID
  groupName: string;
  activeCount: number;
  passcode?: string;
  createdBy?: string;
  members?: string[]; // Array of user emails
}

export interface UserProfile {
  email: string;
  fullName: string;
  password?: string; // In a real app, this should be hashed!
  createdAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private firestore = inject(Firestore);

  private messagesSubject = new BehaviorSubject<Message[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private currentUserSubject = new BehaviorSubject<string>('');
  public currentUser$ = this.currentUserSubject.asObservable();

  private currentGroupSubject = new BehaviorSubject<string>('');
  public currentGroup$ = this.currentGroupSubject.asObservable();

  private activeUsersSubject = new BehaviorSubject<ActiveUser[]>([]);
  public activeUsers$ = this.activeUsersSubject.asObservable();

  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  public userProfile$ = this.userProfileSubject.asObservable();

  private heartbeatInterval: any;
  private readonly HEARTBEAT_INTERVAL = 10000; // 10 seconds
  private readonly USER_TIMEOUT = 30000; // 30 seconds
  private joinTime: Date | null = null; // Track when user joined

  constructor() {
    // Try to restore session from localStorage
    const savedUser = localStorage.getItem('chat_user');
    if (savedUser) {
      this.userProfileSubject.next(JSON.parse(savedUser));
    }
  }

  // --- Authentication ---

  async register(email: string, fullName: string, password: string): Promise<boolean> {
    try {
      // Check if user exists
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('email', '==', email));
      const snapshot = await import('@angular/fire/firestore').then(m => m.getDocs(q));

      if (!snapshot.empty) {
        throw new Error('User already exists');
      }

      const newUser: UserProfile = {
        email,
        fullName,
        password, // WARNING: Storing plain text password for demo only
        createdAt: new Date()
      };

      await addDoc(usersRef, newUser);
      this.userProfileSubject.next(newUser);
      localStorage.setItem('chat_user', JSON.stringify(newUser));
      return true;
    } catch (err) {
      console.error('Registration failed:', err);
      throw err;
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('email', '==', email), where('password', '==', password));
      const snapshot = await import('@angular/fire/firestore').then(m => m.getDocs(q));

      if (snapshot.empty) {
        throw new Error('Invalid credentials');
      }

      const userData = snapshot.docs[0].data() as UserProfile;
      this.userProfileSubject.next(userData);
      localStorage.setItem('chat_user', JSON.stringify(userData));
      return true;
    } catch (err) {
      console.error('Login failed:', err);
      throw err;
    }
  }

  logout() {
    this.userProfileSubject.next(null);
    localStorage.removeItem('chat_user');
    this.stopHeartbeat();
  }

  // --- Group Management ---

  async createGroup(groupName: string): Promise<string> {
    const user = this.userProfileSubject.value;
    if (!user) throw new Error('Not logged in');

    // Generate 6-digit passcode
    const passcode = Math.floor(100000 + Math.random() * 900000).toString();

    const newGroup = {
      groupName,
      passcode,
      createdBy: user.email,
      createdAt: new Date(),
      members: [user.email]
    };

    const groupsRef = collection(this.firestore, 'groups');
    // Check if group name exists
    const q = query(groupsRef, where('groupName', '==', groupName));
    const snapshot = await import('@angular/fire/firestore').then(m => m.getDocs(q));

    if (!snapshot.empty) {
      throw new Error('Group name already taken');
    }

    await addDoc(groupsRef, newGroup);
    return passcode;
  }

  async validateGroupPasscode(groupName: string, passcode: string): Promise<boolean> {
    const groupsRef = collection(this.firestore, 'groups');
    const q = query(groupsRef, where('groupName', '==', groupName), where('passcode', '==', passcode));
    const snapshot = await import('@angular/fire/firestore').then(m => m.getDocs(q));

    return !snapshot.empty;
  }

  async joinGroupPersistent(groupName: string) {
    const user = this.userProfileSubject.value;
    if (!user) return;

    const groupsRef = collection(this.firestore, 'groups');
    const q = query(groupsRef, where('groupName', '==', groupName));
    const snapshot = await import('@angular/fire/firestore').then(m => m.getDocs(q));

    if (!snapshot.empty) {
      const groupDoc = snapshot.docs[0];
      const groupData = groupDoc.data();
      const members = groupData['members'] || [];

      if (!members.includes(user.email)) {
        const { updateDoc, arrayUnion } = await import('@angular/fire/firestore');
        await updateDoc(groupDoc.ref, {
          members: arrayUnion(user.email)
        });
      }
    }
  }

  getActiveGroups(): Observable<GroupInfo[]> {
    const groupsCollection = collection(this.firestore, 'groups');
    const activeUsersCollection = collection(this.firestore, 'activeUsers');
    // Combine groups data with active users count
    return combineLatest([
      collectionData(groupsCollection, { idField: 'id' }),
      collectionData(activeUsersCollection)
    ]).pipe(
      map(([groups, users]: [any[], any[]]) => {
        const now = new Date().getTime();

        // Calculate active counts
        const groupCounts = new Map<string, number>();
        users.forEach(user => {
          const lastSeen = user.lastSeen?.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
          if (now - lastSeen.getTime() < this.USER_TIMEOUT) {
            groupCounts.set(user.group, (groupCounts.get(user.group) || 0) + 1);
          }
        });

        return groups.map(g => ({
          ...g,
          activeCount: groupCounts.get(g.groupName) || 0
        })).sort((a, b) => b.activeCount - a.activeCount);
      })
    );
  }

  joinGroup(groupName: string, userName: string) {
    console.log(`Joining group: ${groupName} as ${userName}`);

    // Record join time
    this.joinTime = new Date();

    this.currentGroupSubject.next(groupName);
    this.currentUserSubject.next(userName);

    // Update user presence
    this.updatePresence(groupName, userName);

    // Start heartbeat to keep presence alive
    this.startHeartbeat(groupName, userName);

    // Send join notification
    this.sendSystemMessage(groupName, `${userName} joined the chat`);

    // Listen to messages for this group
    const messagesCollection = collection(this.firestore, 'messages');
    const q = query(
      messagesCollection,
      where('group', '==', groupName)
    );

    collectionData(q).subscribe({
      next: (msgs: any[]) => {
        console.log('Received messages from Firestore:', msgs.length);
        const formattedMessages = msgs
          .map(msg => ({
            ...msg,
            time: msg.time?.toDate ? msg.time.toDate() : new Date(msg.time)
          }))
          .filter(msg => {
            // Filter out system messages from before user joined
            if (msg.isSystem && this.joinTime) {
              return msg.time >= this.joinTime;
            }
            return true; // Keep all non-system messages
          })
          .sort((a: Message, b: Message) => a.time.getTime() - b.time.getTime());

        this.messagesSubject.next(formattedMessages);
      },
      error: (err) => {
        console.error('Error fetching messages:', err);
      }
    });

    // Listen to active users for this group
    const activeUsersCollection = collection(this.firestore, 'activeUsers');
    const activeUsersQuery = query(
      activeUsersCollection,
      where('group', '==', groupName)
    );

    collectionData(activeUsersQuery).subscribe({
      next: (users: any[]) => {
        console.log('Active users from Firestore:', users.length);
        const now = new Date().getTime();

        // Filter out users who haven't been seen in the last 30 seconds
        const activeUsers = users
          .map(user => ({
            ...user,
            lastSeen: user.lastSeen?.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen)
          }))
          .filter(user => {
            const timeSinceLastSeen = now - user.lastSeen.getTime();
            return timeSinceLastSeen < this.USER_TIMEOUT;
          });

        console.log('Filtered active users:', activeUsers.length);
        this.activeUsersSubject.next(activeUsers);
      },
      error: (err) => {
        console.error('Error fetching active users:', err);
      }
    });
  }

  async sendMessage(text: string, attachment?: string) {
    const user = this.currentUserSubject.value;
    const group = this.currentGroupSubject.value;
    console.log(`Sending message: "${text}" from ${user} to ${group}`);

    if (!user || !group) {
      console.error('User or Group is missing!');
      return;
    }

    const newMessage: any = {
      user,
      text,
      group,
      time: new Date(),
      isSystem: false
    };

    if (attachment) {
      newMessage.attachment = attachment;
    }

    try {
      const messagesCollection = collection(this.firestore, 'messages');
      await addDoc(messagesCollection, newMessage);
      console.log('Message sent successfully');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }

  getCurrentUser(): string {
    return this.currentUserSubject.value;
  }

  getCurrentGroup(): string {
    return this.currentGroupSubject.value;
  }

  async updatePresence(groupName: string, userName: string) {
    try {
      const userDocId = `${groupName}_${userName}`;
      const userDocRef = doc(this.firestore, 'activeUsers', userDocId);

      await setDoc(userDocRef, {
        username: userName,
        group: groupName,
        lastSeen: new Date()
      });

      console.log('Presence updated for', userName);
    } catch (err) {
      console.error('Error updating presence:', err);
    }
  }

  async removePresence(groupName: string, userName: string) {
    try {
      // Stop heartbeat first
      this.stopHeartbeat();

      // Remove from activeUsers collection FIRST
      const userDocId = `${groupName}_${userName}`;
      const userDocRef = doc(this.firestore, 'activeUsers', userDocId);

      await deleteDoc(userDocRef);
      console.log('Presence removed for', userName);

      // Then send leave notification
      await this.sendSystemMessage(groupName, `${userName} left the chat`);
    } catch (err) {
      console.error('Error removing presence:', err);
    }
  }

  private async sendSystemMessage(groupName: string, text: string) {
    try {
      const systemMessage = {
        user: 'System',
        text,
        group: groupName,
        time: new Date(),
        isSystem: true
      };

      const messagesCollection = collection(this.firestore, 'messages');
      await addDoc(messagesCollection, systemMessage);
      console.log('System message sent:', text);
    } catch (err) {
      console.error('Error sending system message:', err);
    }
  }

  private startHeartbeat(groupName: string, userName: string) {
    // Clear any existing heartbeat
    this.stopHeartbeat();

    // Update presence every 10 seconds
    this.heartbeatInterval = setInterval(() => {
      console.log('Heartbeat: updating presence for', userName);
      this.updatePresence(groupName, userName);
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('Heartbeat stopped');
    }
  }
}
