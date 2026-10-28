import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Certificate } from '../../../core/models/certificate.model';
import { CertificateService } from '../../../core/services/certificate.service';
import { CertificateArtworkComponent } from '../components/certificate-artwork/certificate-artwork.component';
import { ShareCertificateModalComponent } from '../components/share-certificate-modal/share-certificate-modal.component';

const PAGE_SIZE = 6;

interface PaginationItem {
  value: number;
  label: string;
  ellipsis: boolean;
}

@Component({
  selector: 'app-my-certificates',
  standalone: true,
  imports: [RouterLink, CertificateArtworkComponent, ShareCertificateModalComponent],
  templateUrl: './my-certificates.component.html',
  styleUrl: './my-certificates.component.css'
})
export class MyCertificatesComponent {
  private readonly certificateService = inject(CertificateService);

  readonly listTop = viewChild<ElementRef<HTMLElement>>('listTop');

  readonly certificates = signal<Certificate[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly page = signal(1);
  readonly shareTarget = signal<Certificate | null>(null);
  readonly skeletonItems = [1, 2, 3, 4, 5, 6];

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.certificates().length / PAGE_SIZE)));

  readonly pagedCertificates = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.certificates().slice(start, start + PAGE_SIZE);
  });

  readonly pages = computed<PaginationItem[]>(() => {
    const total = this.totalPages();
    const current = this.page();

    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => this.pageItem(index + 1));
    }
    if (current <= 4) {
      return [
        ...Array.from({ length: 5 }, (_, index) => this.pageItem(index + 1)),
        this.ellipsisItem(),
        this.pageItem(total)
      ];
    }
    if (current >= total - 3) {
      return [
        this.pageItem(1),
        this.ellipsisItem(),
        ...Array.from({ length: 5 }, (_, index) => this.pageItem(total - 4 + index))
      ];
    }
    return [
      this.pageItem(1),
      this.ellipsisItem(),
      this.pageItem(current - 1),
      this.pageItem(current),
      this.pageItem(current + 1),
      this.ellipsisItem(),
      this.pageItem(total)
    ];
  });

  constructor() {
    this.loadCertificates();
  }

  loadCertificates(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.certificateService.getMyCertificates().subscribe({
      next: certificates => {
        this.certificates.set(certificates);
        this.loading.set(false);
        if (this.page() > this.totalPages()) {
          this.page.set(this.totalPages());
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      }
    });
  }

  goToPage(page: number): void {
    const target = Math.min(Math.max(page, 1), this.totalPages());
    if (target === this.page()) return;
    this.page.set(target);
    setTimeout(() => {
      this.listTop()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  openShare(certificate: Certificate): void {
    this.shareTarget.set(certificate);
  }

  async download(certificate: Certificate): Promise<void> {
    await this.certificateService.printCertificate(certificate);
  }

  private pageItem(value: number): PaginationItem {
    return { value, label: value.toString(), ellipsis: false };
  }

  private ellipsisItem(): PaginationItem {
    return { value: 0, label: '…', ellipsis: true };
  }
}
