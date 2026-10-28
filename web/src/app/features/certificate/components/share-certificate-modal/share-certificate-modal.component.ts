import { Component, ElementRef, HostListener, OnDestroy, computed, inject, input, output, viewChild } from '@angular/core';
import { Certificate } from '../../../../core/models/certificate.model';
import { CertificateService } from '../../../../core/services/certificate.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-share-certificate-modal',
  standalone: true,
  templateUrl: './share-certificate-modal.component.html',
  styleUrl: './share-certificate-modal.component.css'
})
export class ShareCertificateModalComponent implements OnDestroy {
  private readonly certificateService = inject(CertificateService);
  private readonly toastService = inject(ToastService);

  readonly certificate = input.required<Certificate>();
  readonly closed = output<void>();

  readonly shareUrl = computed(() => this.certificateService.getShareUrl(this.certificate().code));
  readonly displayShareUrl = computed(() => this.shareUrl().replace(/^https?:\/\//, ''));
  readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  private readonly previousOverflow = document.body.style.overflow;

  constructor() {
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => this.closeButton()?.nativeElement.focus());
  }

  selectInput(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
  }

  close(): void {
    document.body.style.overflow = this.previousOverflow;
    this.closed.emit();
  }

  async copyLink(): Promise<void> {
    const url = this.shareUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        this.legacyCopy(url);
      }
      this.toastService.showToast({ type: 'success', message: 'Đã sao chép liên kết' });
    } catch {
      this.toastService.showToast({ type: 'error', message: 'Không thể sao chép liên kết. Vui lòng thử lại.' });
    }
  }

  shareToFacebook(): void {
    const url = encodeURIComponent(this.shareUrl());
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'noopener,noreferrer,width=640,height=640');
  }

  shareToLinkedIn(): void {
    const url = encodeURIComponent(this.shareUrl());
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener,noreferrer,width=640,height=640');
  }

  private legacyCopy(value: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
