import { CommonModule, DOCUMENT } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LEGAL_CONTACT,
  LEGAL_DOCUMENTS,
  LegalDocument,
  LegalDocumentId,
  isLegalSection,
} from './legal-documents';

@Component({
  selector: 'app-legal-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './legal.component.html',
  styleUrl: './legal.component.css'
})
export class LegalComponent implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browserDocument = inject(DOCUMENT);

  readonly contact = LEGAL_CONTACT;
  readonly legalDocument = signal<LegalDocument>(LEGAL_DOCUMENTS.terms);

  constructor() {
    this.route.url
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((segments) => {
        const documentId: LegalDocumentId = segments.some((segment) => segment.path === 'policy')
          ? 'policy'
          : 'terms';
        this.legalDocument.set(LEGAL_DOCUMENTS[documentId]);
      });
  }

  ngAfterViewInit(): void {
    const requestedSection = this.route.snapshot.queryParamMap.get('section')
      ?? this.route.snapshot.fragment;

    if (!isLegalSection(this.legalDocument().id, requestedSection)) {
      return;
    }

    requestAnimationFrame(() => {
      this.browserDocument.getElementById(requestedSection!)?.scrollIntoView({ block: 'start' });
    });
  }
}
