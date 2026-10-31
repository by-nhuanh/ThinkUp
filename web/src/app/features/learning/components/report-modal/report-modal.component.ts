import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideCircleAlert,
  LucideCopyright,
  LucideEllipsis,
  LucideMail,
  LucideTriangleAlert,
  LucideUserRound,
  LucideX,
} from '@lucide/angular';
import { ReportReason } from '../../models/learning.model';

@Component({
  selector: 'app-report-modal',
  standalone: true,
  imports: [
    FormsModule,
    LucideCircleAlert,
    LucideCopyright,
    LucideEllipsis,
    LucideMail,
    LucideTriangleAlert,
    LucideUserRound,
    LucideX,
  ],
  templateUrl: './report-modal.component.html',
})
export class ReportModalComponent implements AfterViewInit {
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  @Input() author = '';
  @Input() content = '';
  @Input({ required: true }) reasons: ReportReason[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<{ reasonId: string; detail: string }>();

  selectedReasonId = '';
  detail = '';
  error = '';
  submitting = false;
  private readonly previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngAfterViewInit(): void {
    this.closeButton?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    const focusable = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
      )
    ).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (keyboardEvent.shiftKey && document.activeElement === first) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  }

  close(): void {
    this.closed.emit();
    window.setTimeout(() => this.previousFocus?.focus());
  }

  selectReason(id: string): void {
    this.selectedReasonId = id;
    this.error = '';
  }

  submit(): void {
    if (!this.selectedReasonId) {
      this.error = 'Vui lòng chọn lý do báo cáo.';
      return;
    }
    if (this.detail.trim().length < 10) {
      this.error = 'Vui lòng mô tả chi tiết ít nhất 10 ký tự.';
      return;
    }
    this.submitting = true;
    this.submitted.emit({ reasonId: this.selectedReasonId, detail: this.detail.trim() });
  }
}
