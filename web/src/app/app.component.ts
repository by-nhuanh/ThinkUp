import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommerceService } from './core/services/commerce.service';
import { FavoritesService } from './core/services/favorites.service';
import { ToastService } from './core/services/toast.service';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { inject as injectAnalytics } from '@vercel/analytics';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';
import { BrandOnlyHeaderComponent } from './shared/components/brand-only-header/brand-only-header.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { InstructorCardComponent } from './shared/components/instructor-card/instructor-card.component';
import { InstructorCardService } from './core/services/instructor-card.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, BrandOnlyHeaderComponent, HeaderComponent, FooterComponent, ToastComponent, InstructorCardComponent],
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
    const commerce = inject(CommerceService);
    const favorites = inject(FavoritesService);
    const toast = inject(ToastService);
    const accountId = computed(() => this.authService.currentUser()?.id);
    effect(onCleanup => {
      const id = accountId();
      // Cart reads during initialization must not re-run this account effect
      // or cancel its pending requests when cart state changes.
      untracked(() => {
        commerce.clearAccountCart();
        if (!id) {
          const guestCart = commerce.refreshCart().subscribe({ error: () => undefined });
          onCleanup(() => guestCart.unsubscribe());
          return;
        }
        const cartSync = commerce.mergeGuestCart().subscribe({
          error: () => toast.showToast({ type: 'warning', message: 'Chưa đồng bộ được giỏ hàng. Dữ liệu khách vẫn được giữ để thử lại.' }),
        });
        const favoritesSync = favorites.syncGuestFavorites().subscribe({
          error: () => toast.showToast({ type: 'warning', message: 'Chưa đồng bộ được danh sách yêu thích.' }),
        });
        onCleanup(() => { cartSync.unsubscribe(); favoritesSync.unsubscribe(); });
      });
    });
    injectSpeedInsights();
    injectAnalytics();
    this.updateShell(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(event => {
      this.authService.syncFromStorage();
      this.updateShell(event.urlAfterRedirects);
    });
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

