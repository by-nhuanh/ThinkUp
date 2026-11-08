import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { passwordPolicyGuard } from './core/guards/password-policy.guard';
import { twoFactorGuard } from './core/guards/two-factor.guard';
import { CONTENT_PROVIDERS } from './features/content/services/content.providers';
import { COURSE_PROVIDERS } from './features/courses/services/course.providers';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'auth/two-factor',
    canActivate: [twoFactorGuard],
    loadComponent: () => import('./features/auth/two-factor/two-factor.component').then(m => m.TwoFactorComponent)
  },
  {
    path: 'auth/backup-code',
    canActivate: [twoFactorGuard],
    loadComponent: () => import('./features/auth/backup-code/backup-code.component').then(m => m.BackupCodeComponent)
  },
  {
    path: 'auth/setup-2fa',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/setup-2fa/setup-2fa.component').then(m => m.SetupTwoFactorComponent)
  },
  {
    path: 'auth/backup-codes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/backup-codes/backup-codes.component').then(m => m.BackupCodesComponent)
  },
  {
    path: 'auth/change-password',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/change-password/change-password.component').then(m => m.ChangePasswordComponent)
  },
  {
    path: 'auth/password-expiring',
    canActivate: [authGuard],
    data: { mode: 'expiring' },
    loadComponent: () => import('./features/auth/password-expiry/password-expiry.component').then(m => m.PasswordExpiryComponent)
  },
  {
    path: 'auth/password-expired',
    canActivate: [authGuard],
    data: { mode: 'expired' },
    loadComponent: () => import('./features/auth/password-expiry/password-expiry.component').then(m => m.PasswordExpiryComponent)
  },
  {
    path: '',
    canActivate: [authGuard, passwordPolicyGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./features/dashboard/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'users/lecturers', loadComponent: () => import('./features/users/lecturers/lecturers.component').then(m => m.LecturersComponent) },
      { path: 'users/lecturers/:id', loadComponent: () => import('./features/users/lecturer-detail/lecturer-detail.component').then(m => m.LecturerDetailComponent) },
      { path: 'users/students', loadComponent: () => import('./features/users/students/students.component').then(m => m.StudentsComponent) },
      { path: 'business/orders', loadComponent: () => import('./features/business/orders/orders.component').then(m => m.OrdersComponent) },
      { path: 'business/vouchers', loadComponent: () => import('./features/business/vouchers/vouchers.component').then(m => m.VouchersComponent) },
      { path: 'business/payouts', loadComponent: () => import('./features/business/payouts/payouts.component').then(m => m.PayoutsComponent) },
      {
        path: 'courses',
        providers: COURSE_PROVIDERS,
        children: [
          { path: '', loadComponent: () => import('./features/courses/course-list/course-list.component').then(m => m.CourseListComponent) },
          { path: 'approvals', loadComponent: () => import('./features/courses/approvals/approvals.component').then(m => m.CourseApprovalsComponent) },
          { path: 'approvals/:id', loadComponent: () => import('./features/courses/approval-workspace/approval-workspace.component').then(m => m.ApprovalWorkspaceComponent) },
          { path: 'roadmaps', loadComponent: () => import('./features/courses/roadmaps/roadmap-list.component').then(m => m.RoadmapListComponent) },
          { path: 'roadmaps/:id/studio', loadComponent: () => import('./features/courses/roadmap-studio/roadmap-studio.component').then(m => m.RoadmapStudioComponent) }
        ]
      },
      {
        path: 'content',
        providers: CONTENT_PROVIDERS,
        children: [
          { path: '', redirectTo: 'posts', pathMatch: 'full' },
          { path: 'posts', loadComponent: () => import('./features/content/posts/post-list.component').then(m => m.ContentPostListComponent) },
          { path: 'posts/new', loadComponent: () => import('./features/content/posts/post-editor.component').then(m => m.ContentPostEditorComponent) },
          { path: 'posts/:id/edit', loadComponent: () => import('./features/content/posts/post-editor.component').then(m => m.ContentPostEditorComponent) },
          { path: 'comments', loadComponent: () => import('./features/content/comments/comments.component').then(m => m.ContentCommentsComponent) },
          { path: 'reviews', loadComponent: () => import('./features/content/reviews/reviews.component').then(m => m.ContentReviewsComponent) },
          { path: 'reports', loadComponent: () => import('./features/content/reports/reports.component').then(m => m.ContentReportsComponent) },
          { path: 'reports/:id', loadComponent: () => import('./features/content/reports/reports.component').then(m => m.ContentReportsComponent) }
        ]
      },
      { path: 'support/tickets/:id', loadComponent: () => import('./features/support/ticket-detail/ticket-detail.component').then(m => m.TicketDetailComponent) },
      { path: 'support/tickets', loadComponent: () => import('./features/support/tickets/tickets.component').then(m => m.TicketsComponent) },
      { path: 'support/complaints/:id', loadComponent: () => import('./features/support/complaint-detail/complaint-detail.component').then(m => m.ComplaintDetailComponent) },
      { path: 'support/complaints', loadComponent: () => import('./features/support/complaints/complaints.component').then(m => m.ComplaintsComponent) },
      { path: 'support/faq', loadComponent: () => import('./features/support/faq/faq.component').then(m => m.FaqComponent) }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
