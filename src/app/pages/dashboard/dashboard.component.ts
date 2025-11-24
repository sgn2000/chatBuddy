import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService, GroupInfo, UserProfile } from '../../services/chat.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dashboard-container">
      <div class="header">
        <div class="user-info">
          <div class="avatar">{{ (user?.fullName || '').charAt(0).toUpperCase() }}</div>
          <div>
            <h2>Welcome, {{ user?.fullName }}</h2>
            <p>{{ user?.email }}</p>
          </div>
        </div>
        <button class="logout-btn" (click)="logout()">Logout</button>
      </div>

      <div class="content-grid">
        <!-- Create Group Section -->
        <div class="card create-card">
          <h3>Create New Group</h3>
          <p>Start a new conversation and invite friends.</p>
          
          <div class="form-group">
            <input type="text" [(ngModel)]="newGroupName" placeholder="Enter group name">
          </div>
          
          <button class="action-btn" (click)="createGroup()" [disabled]="!newGroupName.trim() || isLoading">
            {{ isLoading ? 'Creating...' : 'Create Group' }}
          </button>

          <div class="passcode-display" *ngIf="generatedPasscode">
            <p>Group Created! Share this passcode:</p>
            <div class="code">{{ generatedPasscode }}</div>
            <button class="join-now-btn" (click)="joinCreatedGroup()">Join Now</button>
          </div>
        </div>

        <!-- Your Groups Section -->
        <div class="card my-groups-card">
          <h3>Your Groups</h3>
          <p>Groups you have already joined.</p>

          <div class="groups-list">
            <div *ngFor="let group of myGroups" class="group-item" (click)="enterGroup(group)">
              <div class="group-details">
                <span class="group-name">{{ group.groupName }}</span>
                <span class="active-count">{{ group.activeCount }} active</span>
              </div>
              <button class="join-icon">➜</button>
            </div>
            <div *ngIf="myGroups.length === 0" class="no-groups">
              You haven't joined any groups yet.
            </div>
          </div>
        </div>

        <!-- Public Groups Section -->
        <div class="card public-groups-card">
          <h3>Public Groups</h3>
          <p>Discover other active groups.</p>

          <div class="groups-list">
            <div *ngFor="let group of otherGroups" class="group-item" (click)="selectGroupToJoin(group)">
              <div class="group-details">
                <span class="group-name">{{ group.groupName }}</span>
                <span class="active-count">{{ group.activeCount }} active</span>
              </div>
              <button class="join-icon">🔒</button>
            </div>
            <div *ngIf="otherGroups.length === 0" class="no-groups">
              No other active groups found.
            </div>
          </div>
        </div>
      </div>

      <!-- Passcode Modal -->
      <div class="modal-overlay" *ngIf="selectedGroup">
        <div class="modal">
          <h3>Join {{ selectedGroup.groupName }}</h3>
          <p>Enter the 6-digit passcode to join.</p>
          
          <input type="text" [(ngModel)]="passcodeInput" maxlength="6" placeholder="123456" class="passcode-input">
          
          <div class="error-msg" *ngIf="joinError">{{ joinError }}</div>

          <div class="modal-actions">
            <button class="cancel-btn" (click)="selectedGroup = null; joinError = ''">Cancel</button>
            <button class="confirm-btn" (click)="joinGroupWithPasscode()">Join Group</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      height: 100vh;
      background: #1e2124;
      color: white;
      padding: 30px;
      overflow-y: auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid rgba(114, 137, 218, 0.2);
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .avatar {
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, #7289da, #5b6eae);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: bold;
    }

    .user-info h2 {
      margin: 0;
      font-size: 1.2rem;
    }

    .user-info p {
      margin: 4px 0 0;
      color: #b9bbbe;
      font-size: 0.9rem;
    }

    .logout-btn {
      background: rgba(240, 71, 71, 0.1);
      color: #f04747;
      border: 1px solid rgba(240, 71, 71, 0.3);
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .logout-btn:hover {
      background: rgba(240, 71, 71, 0.2);
    }

    .content-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      max-width: 1200px; /* Increased max-width */
      margin: 0 auto;
    }

    .card {
      background: #282b30;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .card h3 {
      margin-top: 0;
      color: #7289da;
    }

    .card p {
      color: #b9bbbe;
      margin-bottom: 20px;
    }

    .form-group input {
      width: 100%;
      padding: 12px;
      background: #1e2124;
      border: 1px solid #72767d;
      border-radius: 6px;
      color: white;
      margin-bottom: 16px;
    }

    .action-btn {
      width: 100%;
      padding: 12px;
      background: #7289da;
      border: none;
      border-radius: 6px;
      color: white;
      font-weight: 600;
      cursor: pointer;
    }

    .action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .passcode-display {
      margin-top: 20px;
      background: rgba(67, 181, 129, 0.1);
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      border: 1px solid rgba(67, 181, 129, 0.3);
    }

    .passcode-display p {
      color: #43b581;
      margin-bottom: 8px;
    }

    .code {
      font-size: 2rem;
      font-weight: bold;
      letter-spacing: 4px;
      color: white;
      margin-bottom: 12px;
    }

    .join-now-btn {
      background: #43b581;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }

    .groups-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 300px;
      overflow-y: auto;
    }

    .group-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: #1e2124;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .group-item:hover {
      background: #36393f;
    }

    .group-details {
      display: flex;
      flex-direction: column;
    }

    .group-name {
      font-weight: 600;
    }

    .active-count {
      font-size: 0.8rem;
      color: #b9bbbe;
    }

    .join-icon {
      background: none;
      border: none;
      color: #7289da;
      font-size: 1.2rem;
      cursor: pointer;
    }

    .no-groups {
      text-align: center;
      color: #72767d;
      padding: 20px;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: #36393f;
      padding: 30px;
      border-radius: 12px;
      width: 90%;
      max-width: 400px;
      text-align: center;
    }

    .passcode-input {
      font-size: 1.5rem;
      letter-spacing: 4px;
      text-align: center;
      width: 100%;
      padding: 12px;
      background: #202225;
      border: 1px solid #72767d;
      border-radius: 6px;
      color: white;
      margin: 20px 0;
    }

    .error-msg {
      color: #f04747;
      margin-bottom: 16px;
    }

    .modal-actions {
      display: flex;
      gap: 12px;
    }

    .modal-actions button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }

    .cancel-btn {
      background: transparent;
      color: #b9bbbe;
    }

    .cancel-btn:hover {
      text-decoration: underline;
    }

    .confirm-btn {
      background: #7289da;
      color: white;
    }
  `]
})
export class DashboardComponent implements OnInit {
  user: UserProfile | null = null;
  myGroups: GroupInfo[] = [];
  otherGroups: GroupInfo[] = [];

  // Create Group
  newGroupName = '';
  isLoading = false;
  generatedPasscode = '';

  // Join Group
  selectedGroup: GroupInfo | null = null;
  passcodeInput = '';
  joinError = '';

  constructor(private chatService: ChatService, private router: Router) { }

  ngOnInit() {
    this.chatService.userProfile$.subscribe(user => {
      if (!user) {
        this.router.navigate(['/auth']);
      } else {
        this.user = user;
      }
    });

    this.chatService.getActiveGroups().subscribe(groups => {
      if (this.user) {
        this.myGroups = groups.filter(g => g.members?.includes(this.user!.email));
        this.otherGroups = groups.filter(g => !g.members?.includes(this.user!.email));
      }
    });
  }

  logout() {
    this.chatService.logout();
    this.router.navigate(['/auth']);
  }

  async createGroup() {
    if (!this.newGroupName.trim()) return;

    this.isLoading = true;
    try {
      this.generatedPasscode = await this.chatService.createGroup(this.newGroupName);
      // Refresh groups list logic handled by subscription
    } catch (err: any) {
      alert(err.message);
    } finally {
      this.isLoading = false;
    }
  }

  joinCreatedGroup() {
    if (this.user && this.newGroupName) {
      this.enterGroup({ groupName: this.newGroupName } as GroupInfo);
    }
  }

  enterGroup(group: GroupInfo) {
    if (this.user) {
      this.chatService.joinGroup(group.groupName, this.user.fullName);
      this.router.navigate(['/chat']);
    }
  }

  selectGroupToJoin(group: GroupInfo) {
    this.selectedGroup = group;
    this.passcodeInput = '';
    this.joinError = '';
  }

  async joinGroupWithPasscode() {
    if (!this.selectedGroup || !this.passcodeInput) return;

    try {
      const isValid = await this.chatService.validateGroupPasscode(this.selectedGroup.groupName, this.passcodeInput);

      if (isValid && this.user) {
        // Add user to group members persistently
        await this.chatService.joinGroupPersistent(this.selectedGroup.groupName);

        // Navigate to chat
        this.enterGroup(this.selectedGroup);
      } else {
        this.joinError = 'Invalid passcode';
      }
    } catch (err) {
      this.joinError = 'Error joining group';
    }
  }
}
