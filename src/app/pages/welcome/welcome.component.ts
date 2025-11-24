import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService, GroupInfo } from '../../services/chat.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css'
})
export class WelcomeComponent implements OnInit {
  groupName = '';
  userName = '';
  activeGroups: GroupInfo[] = [];

  constructor(private chatService: ChatService, private router: Router) { }

  ngOnInit() {
    // Subscribe to active groups
    this.chatService.getActiveGroups().subscribe(groups => {
      this.activeGroups = groups;
      console.log('Active groups:', groups);
    });
  }

  joinGroup() {
    if (this.groupName.trim() && this.userName.trim()) {
      this.chatService.joinGroup(this.groupName, this.userName);
      this.router.navigate(['/chat']);
    }
  }

  selectGroup(groupName: string) {
    this.groupName = groupName;
  }
}
