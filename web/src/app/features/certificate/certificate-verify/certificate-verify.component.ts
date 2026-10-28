import { Component, DestroyRef, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideShieldCheck } from '@lucide/angular';
import { CertificateVerification } from '../../../core/models/certificate.model';
import { CertificateService } from '../../../core/services/certificate.service';
import { CertificateArtworkComponent } from '../components/certificate-artwork/certificate-artwork.component';

type VerifyState = 'idle' | 'loading' | 'success' | 'not-found' | 'error';

@Component({
  selector: 'app-certificate-verify',
  standalone: true,
  imports: [RouterLink, CertificateArtworkComponent, LucideShieldCheck],
  templateUrl: './certificate-verify.component.html',
  styleUrl: './certificate-verify.component.css'
})
export class CertificateVerifyComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly certificateService = inject(CertificateService);
  private readonly meta = inject(Meta);
  private readonly destroyRef = inject(DestroyRef);

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly resultSection = viewChild<ElementRef<HTMLElement>>('resultSection');

  readonly code = signal('');
  readonly state = signal<VerifyState>('idle');
  readonly result = signal<CertificateVerification | null>(null);
  readonly submittedCode = signal('');

  readonly hasInputError = computed(
    () =>
      this.state() === 'not-found' &&
      !!this.submittedCode() &&
      this.certificateService.normalizeCode(this.code()) === this.submittedCode()
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const code = (params.get('code') ?? '').trim();
      if (code && this.state() === 'idle') {
        this.code.set(code);
        this.searchCode(code, false);
      }
    });

    effect(() => {
      const hasCode = !!this.submittedCode();
      this.meta.updateTag({
        name: 'robots',
        content: hasCode ? 'noindex, nofollow' : 'index, follow'
      });
    });
  }

  ngOnDestroy(): void {
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
  }

  submit(): void {
    const normalized = this.certificateService.normalizeCode(this.code());
    if (!normalized) {
      this.focusSearch();
      return;
    }
    if (normalized === this.submittedCode() && this.state() === 'success') {
      this.scrollToResult();
      return;
    }
    this.searchCode(normalized, true);
  }

  onCodeInputEvent(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.toUpperCase());
  }

  searchAgain(): void {
    this.focusSearch();
  }

  retry(): void {
    this.searchCode(this.submittedCode() || this.code(), false);
  }

  private searchCode(rawCode: string, updateUrl: boolean): void {
    const normalized = this.certificateService.normalizeCode(rawCode);
    if (!normalized) {
      this.focusSearch();
      return;
    }

    this.state.set('loading');
    this.result.set(null);
    this.submittedCode.set(normalized);

    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { code: normalized },
        replaceUrl: true
      });
    }

    this.certificateService.verify(normalized).subscribe({
      next: verification => {
        this.result.set(verification);
        this.state.set('success');
        this.scrollToResult();
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        this.state.set(message === 'CERTIFICATE_NOT_FOUND' ? 'not-found' : 'error');
        this.scrollToResult();
      }
    });
  }

  private focusSearch(): void {
    const input = this.searchInput()?.nativeElement;
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
    input.select();
  }

  private scrollToResult(): void {
    setTimeout(() => {
      this.resultSection()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }
}
