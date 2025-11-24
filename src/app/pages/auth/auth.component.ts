import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService } from '../../services/chat.service';

@Component({
    selector: 'app-auth',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="auth-container">
      <div class="auth-box">
        <div class="logo">
          <h1>Chat Buddy</h1>
          <p>Connect with your friends</p>
        </div>

        <div class="tabs">
          <button [class.active]="isLogin" (click)="isLogin = true">Login</button>
          <button [class.active]="!isLogin" (click)="isLogin = false">Sign Up</button>
        </div>

        <form (ngSubmit)="onSubmit()">
          <div class="form-group" *ngIf="!isLogin">
            <label>Full Name</label>
            <input type="text" [(ngModel)]="fullName" name="fullName" placeholder="John Doe" required>
          </div>

          <div class="form-group">
            <label>Email Address</label>
            <input type="email" [(ngModel)]="email" name="email" placeholder="john@example.com" required>
          </div>

          <div class="form-group">
            <label>Password</label>
            <input type="password" [(ngModel)]="password" name="password" placeholder="••••••••" required>
          </div>

          <div class="error-msg" *ngIf="error">{{ error }}</div>

          <button type="submit" class="submit-btn" [disabled]="isLoading">
            {{ isLoading ? 'Please wait...' : (isLogin ? 'Login' : 'Sign Up') }}
          </button>
        </form>
      </div>
    </div>
  `,
    styles: [`
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, #1e2124 0%, #282b30 100%);
      color: white;
    }

    .auth-box {
      background: rgba(54, 57, 62, 0.9);
      padding: 40px;
      border-radius: 16px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(114, 137, 218, 0.1);
    }

    .logo {
      text-align: center;
      margin-bottom: 30px;
    }

    .logo h1 {
      color: #7289da;
      margin: 0;
      font-size: 2rem;
    }

    .logo p {
      color: #b9bbbe;
      margin: 5px 0 0;
    }

    .tabs {
      display: flex;
      margin-bottom: 24px;
      border-bottom: 2px solid rgba(114, 137, 218, 0.2);
    }

    .tabs button {
      flex: 1;
      background: none;
      border: none;
      padding: 12px;
      color: #b9bbbe;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 600;
      transition: all 0.3s;
    }

    .tabs button.active {
      color: #7289da;
      border-bottom: 2px solid #7289da;
      margin-bottom: -2px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #b9bbbe;
      font-size: 0.9rem;
    }

    .form-group input {
      width: 100%;
      padding: 12px;
      background: rgba(30, 33, 36, 0.8);
      border: 1px solid rgba(114, 137, 218, 0.2);
      border-radius: 8px;
      color: white;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.3s;
    }

    .form-group input:focus {
      border-color: #7289da;
    }

    .submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #7289da, #5b6eae);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(114, 137, 218, 0.3);
    }

    .submit-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .error-msg {
      color: #f04747;
      background: rgba(240, 71, 71, 0.1);
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 0.9rem;
      text-align: center;
    }
  `]
})
export class AuthComponent {
    isLogin = true;
    email = '';
    password = '';
    fullName = '';
    isLoading = false;
    error = '';

    constructor(private chatService: ChatService, private router: Router) {
        // Redirect if already logged in
        this.chatService.userProfile$.subscribe(user => {
            if (user) {
                this.router.navigate(['/dashboard']);
            }
        });
    }

    async onSubmit() {
        this.isLoading = true;
        this.error = '';

        try {
            if (this.isLogin) {
                await this.chatService.login(this.email, this.password);
            } else {
                await this.chatService.register(this.email, this.fullName, this.password);
            }
            this.router.navigate(['/dashboard']);
        } catch (err: any) {
            this.error = err.message || 'Authentication failed';
        } finally {
            this.isLoading = false;
        }
    }
}
