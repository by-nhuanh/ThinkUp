import { Component, computed, inject, signal } from '@angular/core';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { inject as injectAnalytics } from '@vercel/analytics';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';
import { BrandOnlyHeaderComponent } from './shared/components/brand-only-header/brand-only-header.component';
import { GuestHeaderComponent } from './shared/components/guest-header/guest-header.component';
import { MemberHeaderComponent } from './shared/components/member-header/member-header.component';
import { StudyRoomHeaderComponent } from './shared/components/study-room-header/study-room-header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { InstructorCardComponent } from './shared/components/instructor-card/instructor-card.component';
import { InstructorCardService } from './core/services/instructor-card.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, BrandOnlyHeaderComponent, GuestHeaderComponent, MemberHeaderComponent, StudyRoomHeaderComponent, FooterComponent, ToastComponent, InstructorCardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  private instructorCardService = inject(InstructorCardService);
  readonly isMember = computed(() => this.authService.isAuthenticated());
  readonly isAuthPage = signal(false);
  readonly isOnboardingPage = signal(false);
  readonly hideFooter = signal(false);
  readonly hideShell = signal(false);
  readonly isStudyLobby = signal(false);

  constructor() {
    injectSpeedInsights();
    injectAnalytics();
    this.updateShell(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(event => this.updateShell(event.urlAfterRedirects));
  }

  private updateShell(url: string): void {
    this.instructorCardService.close();
    this.isAuthPage.set(url.startsWith('/auth') || url.startsWith('/api/auth/verify'));
    this.isOnboardingPage.set(url.startsWith('/onboarding'));
    this.isStudyLobby.set(url.startsWith('/learning/study-room') && !/^\/learning\/study-room\/[^/]+/.test(url));
    let activeRoute = this.router.routerState.snapshot.root;
    while (activeRoute.firstChild) activeRoute = activeRoute.firstChild;
    this.hideShell.set(activeRoute.data['hideShell'] === true);
    this.hideFooter.set(activeRoute.data['hideFooter'] === true);
  }
}

