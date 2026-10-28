import { Component, EventEmitter, Input, Output } from '@angular/core';
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
export class ReportModalComponent {
  @Input() author = '';
  @Input() content = '';
  @Input({ required: true }) reasons: ReportReason[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<{ reasonId: string; detail: string }>();

  selectedReasonId = '';
  detail = '';
  error = '';
  submitting = false;

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
