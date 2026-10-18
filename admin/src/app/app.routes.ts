import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layouts/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./features/dashboard/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'business/orders', loadComponent: () => import('./features/business/orders/orders.component').then(m => m.OrdersComponent) },
      { path: 'business/vouchers', loadComponent: () => import('./features/business/vouchers/vouchers.component').then(m => m.VouchersComponent) },
      { path: 'business/payouts', loadComponent: () => import('./features/business/payouts/payouts.component').then(m => m.PayoutsComponent) }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
