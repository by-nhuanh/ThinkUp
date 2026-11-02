import { Routes } from '@angular/router';
import { onboardingRequiredGuard, onboardingCompletedGuard } from './core/guards/onboarding.guard';
import { guestGuard } from './core/guards/guest.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestHomeGuard, memberHomeGuard } from './core/guards/home-audience.guard';
import { BlogService } from './features/blog/services/blog.service';
import { BLOG_PROVIDERS } from './features/blog/services/blog.providers';
import { unsavedChangesGuard } from './features/profile/guards/unsaved-changes.guard';

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
  // Hồ sơ giảng viên công khai: học viên và khách đều xem được.
  {
    path: 'instructors/:slug',
    loadComponent: () => import('./features/instructors/instructor-profile/instructor-profile.component').then(m => m.InstructorProfileComponent)
  },
  // Main customer routes: chặn mọi trang con cho học viên chưa hoàn thành onboarding.
  {
    path: 'main',
    canActivateChild: [onboardingRequiredGuard],
    children: [
      {
        path: 'home',
        canActivate: [memberHomeGuard],
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
      },
      { path: 'courses', loadComponent: () => import('./features/courses/course-list/course-list.component').then(m => m.CourseListComponent) },
      { path: 'courses/:id', loadComponent: () => import('./features/courses/course-detail/course-detail.component').then(m => m.CourseDetailComponent) },
      { path: 'favorites', loadComponent: () => import('./features/favorites/favorites-list/favorites-list.component').then(m => m.FavoritesListComponent) },
      { path: 'cart', loadComponent: () => import('./features/cart/cart/cart.component').then(m => m.CartComponent) },
      { path: 'checkout', loadComponent: () => import('./features/checkout/checkout/checkout.component').then(m => m.CheckoutComponent) },
      { path: 'checkout/result', loadComponent: () => import('./features/checkout/checkout-success/checkout-success.component').then(m => m.CheckoutSuccessComponent) },
      { path: 'checkout/success', loadComponent: () => import('./features/checkout/checkout-success/checkout-success.component').then(m => m.CheckoutSuccessComponent) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile-overview/profile-overview.component').then(m => m.ProfileOverviewComponent) },
      { path: 'profile/edit', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./features/profile/profile-edit/profile-edit.component').then(m => m.ProfileEditComponent) },
      { path: 'profile/billing', loadComponent: () => import('./features/profile/purchase-history/purchase-history.component').then(m => m.PurchaseHistoryComponent) },
      { path: 'profile/billing/:id', loadComponent: () => import('./features/profile/purchase-transaction-detail/purchase-transaction-detail.component').then(m => m.PurchaseTransactionDetailComponent) },
      { path: 'settings', loadComponent: () => import('./features/settings/settings-home/settings-home.component').then(m => m.SettingsHomeComponent) },
      { path: 'settings/account-security', loadComponent: () => import('./features/settings/account-security/account-security.component').then(m => m.AccountSecurityComponent) },
      { path: 'settings/learning-options', loadComponent: () => import('./features/settings/learning-options/learning-options.component').then(m => m.LearningOptionsComponent) },
      { path: 'settings/notifications', loadComponent: () => import('./features/settings/notifications/notifications.component').then(m => m.NotificationsComponent) },
      { path: 'settings/payment', loadComponent: () => import('./features/settings/payment/payment.component').then(m => m.PaymentComponent) },
      { path: 'my-courses/:courseId/review', loadComponent: () => import('./features/my-courses/review-form/review-form.component').then(m => m.ReviewFormComponent) },
      { path: 'my-courses/:courseId', loadComponent: () => import('./features/my-courses/course-dashboard/course-dashboard.component').then(m => m.CourseDashboardComponent) },
      { path: 'my-courses', loadComponent: () => import('./features/my-courses/my-courses.component').then(m => m.MyCoursesComponent) },
      {
        path: 'certificates',
        canActivate: [authGuard],
        loadComponent: () => import('./features/certificate/my-certificates/my-certificates.component').then(m => m.MyCertificatesComponent)
      },
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
      { path: 'instructors/:slug', loadComponent: () => import('./features/instructors/instructor-profile/instructor-profile.component').then(m => m.InstructorProfileComponent) },
      { path: 'instructors', loadComponent: () => import('./features/support/contact/contact.component').then(m => m.ContactComponent) },
      {
        path: '',
        pathMatch: 'full',
        canActivate: [guestHomeGuard],
        loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent)
      },
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
      { path: 'roadmap/:roadmapId/test/:stageId', loadComponent: () => import('./features/roadmap/roadmap-test/roadmap-test.component').then(m => m.RoadmapTestComponent) },
      { path: 'roadmap/:roadmapId/test/:stageId/processing', loadComponent: () => import('./features/roadmap/roadmap-test-processing/roadmap-test-processing.component').then(m => m.RoadmapTestProcessingComponent) },
      { path: 'roadmap/:roadmapId/test/:stageId/result', loadComponent: () => import('./features/roadmap/roadmap-survey-complete/roadmap-survey-complete.component').then(m => m.RoadmapSurveyCompleteComponent) },
      { path: 'roadmap/:roadmapId/:skillId', loadComponent: () => import('./features/roadmap/roadmap-skill-detail/roadmap-skill-detail.component').then(m => m.RoadmapSkillDetailComponent) },
      { path: 'flashcards', loadComponent: () => import('./features/roadmap/flashcard-list/flashcard-list.component').then(m => m.FlashcardListComponent) },
      { path: 'flashcards/new', loadComponent: () => import('./features/roadmap/flashcard-form/flashcard-form.component').then(m => m.FlashcardFormComponent) },
      { path: 'flashcards/:id', loadComponent: () => import('./features/roadmap/flashcard-detail/flashcard-detail.component').then(m => m.FlashcardDetailComponent) },
      { path: 'flashcards/:id/edit', loadComponent: () => import('./features/roadmap/flashcard-form/flashcard-form.component').then(m => m.FlashcardFormComponent) },
      { path: 'flashcards/:id/study', loadComponent: () => import('./features/roadmap/flashcard-study/flashcard-study.component').then(m => m.FlashcardStudyComponent) },
      { path: 'flashcards/:id/complete', loadComponent: () => import('./features/roadmap/flashcard-complete/flashcard-complete.component').then(m => m.FlashcardCompleteComponent) },
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
  { path: 'profile/me/edit', redirectTo: 'main/profile/edit', pathMatch: 'full' },
  { path: 'profile/me', redirectTo: 'main/profile', pathMatch: 'full' },
  { path: 'profile/edit', redirectTo: 'main/profile/edit', pathMatch: 'full' },
  { path: 'profile', redirectTo: 'main/profile', pathMatch: 'full' },
  // Tra cứu chứng chỉ công khai (không cần đăng nhập)
  {
    path: 'tra-cuu',
    loadComponent: () => import('./features/certificate/certificate-verify/certificate-verify.component').then(m => m.CertificateVerifyComponent)
  },
  // Alias in trên artwork chứng chỉ (thinkup.vn/verify)
  {
    path: 'verify',
    loadComponent: () => import('./features/certificate/certificate-verify/certificate-verify.component').then(m => m.CertificateVerifyComponent)
  },
  // Link chia sẻ dạng /chung-chi/{Mã} -> trang tra cứu kèm mã
  {
    path: 'chung-chi/:code',
    redirectTo: route => `/tra-cuu?code=${encodeURIComponent(route.params['code'] ?? '')}`
  },
  // Default fallback: /main phân luồng landing guest và dashboard member trong nhóm route phía trên.
  { path: '', redirectTo: 'main', pathMatch: 'full' },
  { path: '**', redirectTo: 'main' },
];
