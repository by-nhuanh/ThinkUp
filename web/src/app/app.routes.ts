import { Routes } from '@angular/router';
import { onboardingRequiredGuard, onboardingCompletedGuard } from './core/guards/onboarding.guard';
import { guestGuard } from './core/guards/guest.guard';
import { BlogService } from './features/blog/services/blog.service';
import { BLOG_PROVIDERS } from './features/blog/services/blog.providers';

export const routes: Routes = [
  // Email links may point to the client origin when the backend public URL is not configured.
  {
    path: 'api/auth/verify',
    loadComponent: () => import('./features/auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent)
  },
  // Khảo sát Onboarding chính thức (CanActivate: chặn học viên đã hoàn thành)
  {
    path: 'onboarding',
    canActivate: [onboardingCompletedGuard],
    loadComponent: () => import('./features/onboarding/onboarding-survey/onboarding-survey.component').then(m => m.OnboardingSurveyComponent)
  },
  // Auth routes
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'sign_up',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/sign-up/sign-up.component').then(m => m.SignUpComponent)
      },
      { path: 'sign-up', redirectTo: 'sign_up', pathMatch: 'full' },
      { path: 'verify', loadComponent: () => import('./features/auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent) },
      { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
      { path: 'verify-otp', loadComponent: () => import('./features/auth/verify-otp/verify-otp.component').then(m => m.VerifyOtpComponent) },
      { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
      { path: 'onboarding', redirectTo: '/onboarding', pathMatch: 'full' },
    ]
  },
  // Main customer routes: chặn mọi trang con cho học viên chưa hoàn thành onboarding.
  {
    path: 'main',
    canActivateChild: [onboardingRequiredGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
      },
      { path: 'courses', loadComponent: () => import('./features/courses/course-list/course-list.component').then(m => m.CourseListComponent) },
      { path: 'courses/:id', loadComponent: () => import('./features/courses/course-detail/course-detail.component').then(m => m.CourseDetailComponent) },
      { path: 'favorites', loadComponent: () => import('./features/favorites/favorites-list/favorites-list.component').then(m => m.FavoritesListComponent) },
      { path: 'cart', loadComponent: () => import('./features/cart/cart/cart.component').then(m => m.CartComponent) },
      { path: 'checkout', loadComponent: () => import('./features/checkout/checkout/checkout.component').then(m => m.CheckoutComponent) },
      { path: 'checkout/success', loadComponent: () => import('./features/checkout/checkout-success/checkout-success.component').then(m => m.CheckoutSuccessComponent) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile-overview/profile-overview.component').then(m => m.ProfileOverviewComponent) },
      { path: 'profile/edit', loadComponent: () => import('./features/profile/profile-edit/profile-edit.component').then(m => m.ProfileEditComponent) },
      { path: 'profile/billing', loadComponent: () => import('./features/profile/purchase-history/purchase-history.component').then(m => m.PurchaseHistoryComponent) },
      { path: 'profile/billing/:id', loadComponent: () => import('./features/profile/purchase-transaction-detail/purchase-transaction-detail.component').then(m => m.PurchaseTransactionDetailComponent) },
      { path: 'my-courses', loadComponent: () => import('./features/my-courses/my-courses.component').then(m => m.MyCoursesComponent) },
      {
        path: 'blog',
        providers: [BlogService, ...BLOG_PROVIDERS],
        children: [
          { path: '', loadComponent: () => import('./features/blog/blog-list/blog-list.component').then(m => m.BlogListComponent) },
          { path: 'article/:id', loadComponent: () => import('./features/blog/article-detail/article-detail.component').then(m => m.ArticleDetailComponent) },
          { path: 'create', loadComponent: () => import('./features/blog/create-post/create-post.component').then(m => m.CreatePostComponent) },
          { path: 'edit/:postId', loadComponent: () => import('./features/blog/create-post/create-post.component').then(m => m.CreatePostComponent) },
          { path: 'manage', data: { hideFooter: true }, loadComponent: () => import('./features/blog/manage-posts/manage-posts.component').then(m => m.ManagePostsComponent) },
        ]
      },
      { path: 'contact', loadComponent: () => import('./features/support/contact/contact.component').then(m => m.ContactComponent) },
      { path: 'help-center', loadComponent: () => import('./features/support/contact/contact.component').then(m => m.ContactComponent) },
      { path: 'instructors', loadComponent: () => import('./features/support/contact/contact.component').then(m => m.ContactComponent) },
      { path: '', redirectTo: 'courses', pathMatch: 'full' },
    ]
  },
  // Learning feature routes
  {
    path: 'learning',
    canActivateChild: [onboardingRequiredGuard],
    children: [
      { path: 'learn/:courseId', data: { hideFooter: true }, loadComponent: () => import('./features/learning/lesson-player/lesson-player.component').then(m => m.LessonPlayerComponent) },
      { path: 'study-room', loadComponent: () => import('./features/study-room/study-room-lobby/study-room-lobby.component').then(m => m.StudyRoomLobbyComponent) },
      { path: 'study-room/:roomId', data: { hideShell: true }, loadComponent: () => import('./features/study-room/study-room-view/study-room-view.component').then(m => m.StudyRoomViewComponent) },
      { path: 'roadmap', loadComponent: () => import('./features/roadmap/roadmap-list/roadmap-list.component').then(m => m.RoadmapListComponent) },
      { path: 'roadmap/:id', loadComponent: () => import('./features/roadmap/roadmap-detail/roadmap-detail.component').then(m => m.RoadmapDetailComponent) },
      { path: 'roadmap/:roadmapId/:skillId', loadComponent: () => import('./features/roadmap/roadmap-skill-detail/roadmap-skill-detail.component').then(m => m.RoadmapSkillDetailComponent) },
    ]
  },
  // Legal routes
  {
    path: 'legal',
    children: [
      { path: 'terms', loadComponent: () => import('./features/legal/legal.component').then(m => m.LegalComponent) },
      { path: 'policy', loadComponent: () => import('./features/legal/legal.component').then(m => m.LegalComponent) },
    ]
  },
  // User profile alias
  { path: 'profile', redirectTo: 'main/profile', pathMatch: 'full' },
  // Default fallbacks: khách chưa đăng nhập xem Landing page chuẩn
  { path: 'main', loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent) },
  { path: '', redirectTo: 'main', pathMatch: 'full' },
  { path: '**', redirectTo: 'main' },
];
