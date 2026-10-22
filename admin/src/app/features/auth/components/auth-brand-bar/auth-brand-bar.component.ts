import { Component } from '@angular/core';

/**
 * Thanh thương hiệu dùng chung cho mọi màn hình của luồng xác thực quản trị.
 * Figma: logo mark 32px + wordmark "THINKUP" 28.8px, thanh cao 82px ở khung 1920px.
 */
@Component({
  selector: 'app-auth-brand-bar',
  standalone: true,
  templateUrl: './auth-brand-bar.component.html',
  styleUrl: './auth-brand-bar.component.css'
})
export class AuthBrandBarComponent {}
