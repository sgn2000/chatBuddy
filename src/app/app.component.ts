import { Component } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';

declare global {
  interface Window {
    electronAPI: {
      toggleFloating: () => void;
      expandBubble: () => void;
      collapseBubble: () => void;
      moveWindow: (x: number, y: number) => void;
      resetWindowSize: () => void;
      onViewModeChanged: (callback: (mode: string) => void) => void;
    };
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'chat-app';
  isElectron = false;

  constructor(private router: Router) {
    if (window.electronAPI) {
      this.isElectron = true;
      window.electronAPI.onViewModeChanged((mode) => {
        document.body.classList.remove('mode-normal', 'mode-bubble', 'mode-chat');
        document.body.classList.add(`mode-${mode}`);

        // Legacy support for existing styles if needed, or we can migrate completely
        if (mode !== 'normal') {
          document.body.classList.add('floating-mode');
        } else {
          document.body.classList.remove('floating-mode');
        }
      });
      // Reset window size when navigating to welcome (root) page
      this.router.events.subscribe(event => {
        if (event instanceof NavigationEnd && event.urlAfterRedirects === '/') {
          if (window.electronAPI.resetWindowSize) {
            window.electronAPI.resetWindowSize();
          }
        }
      });
    }
  }

  closeApp() {
    window.close();
  }

  toggleFloatingMode() {
    if (window.electronAPI) {
      window.electronAPI.toggleFloating();
    }
  }
}
