import { Component, effect, inject, input, signal } from '@angular/core';
import { Certificate } from '../../../../core/models/certificate.model';
import { CertificateService } from '../../../../core/services/certificate.service';

/**
 * Artwork chứng chỉ ThinkUp.
 * Toạ độ + cỡ chữ lấy theo frame Figma 1375x1024 và scale bằng `cqw`,
 * để cùng một artwork dùng được ở thẻ danh sách (584px) và trang tra cứu (688px).
 */
@Component({
  selector: 'app-certificate-artwork',
  standalone: true,
  templateUrl: './certificate-artwork.component.html',
  styleUrl: './certificate-artwork.component.css'
})
export class CertificateArtworkComponent {
  private readonly certificateService = inject(CertificateService);

  readonly certificate = input.required<Certificate>();
  readonly aspectRatio = input('1375 / 1024');
  readonly viewOnly = input(false);

  readonly qrDataUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const code = this.certificate().code;
      this.qrDataUrl.set(null);
      void this.certificateService.createQrDataUrl(code).then(url => {
        if (this.certificate().code === code) {
          this.qrDataUrl.set(url);
        }
      });
    });
  }

  blockInteraction(event: Event): void {
    if (this.viewOnly()) {
      event.preventDefault();
    }
  }
}
