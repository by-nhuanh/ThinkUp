import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Certificate } from '../../../../../core/models/profile.model';

@Component({
  selector: 'app-certificates-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './certificates-card.component.html',
  styleUrl: './certificates-card.component.css'
})
export class CertificatesCardComponent {
  @Input() certificates: Certificate[] = [];
  @Input() total = 0;
}
