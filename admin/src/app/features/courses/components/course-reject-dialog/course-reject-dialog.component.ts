import { Component, computed, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { countChars } from '../../course-utils';
import { ApprovalWorkspace } from '../../models/course.models';

export interface RejectPayload {
  reason: string;
  detail: string;
  evidence: string;
}

const REASONS: CustomSelectOption[] = [
  { value: 'Nội dung chưa đạt chất lượng', label: 'Nội dung chưa đạt chất lượng' },
  { value: 'Vi phạm bản quyền', label: 'Vi phạm bản quyền' },
  { value: 'Thông tin sai lệch', label: 'Thông tin sai lệch' },
  { value: 'Vi phạm tiêu chuẩn cộng đồng', label: 'Vi phạm tiêu chuẩn cộng đồng' },
  { value: 'Khác', label: 'Khác' }
];

@Component({
  selector: 'app-course-reject-dialog',
  standalone: true,
  imports: [AdminDialogComponent, CustomSelectComponent],
  templateUrl: './course-reject-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class CourseRejectDialogComponent {
  readonly workspace = input.required<ApprovalWorkspace>();
  readonly closed = output<void>();
  readonly confirmed = output<RejectPayload>();

  readonly reasons = REASONS;
  readonly reason = signal('');
  readonly detail = signal('');
  readonly evidenceName = signal('');
  readonly evidenceUrl = signal('');
  readonly touched = signal(false);

  readonly charCount = computed(() => countChars(this.detail()));
  readonly error = computed(() => this.touched() && this.charCount() < 20
    ? `Cần thêm ${20 - this.charCount()} ký tự để đạt tối thiểu 20.`
    : '');
  readonly canConfirm = computed(() => Boolean(this.reason()) && this.charCount() >= 20);

  setReason(value: string): void { this.reason.set(value); }
  setDetail(value: string): void { this.detail.set(value); }
  setEvidenceUrl(value: string): void { this.evidenceUrl.set(value); }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      this.evidenceName.set('');
      input.value = '';
      return;
    }
    this.evidenceName.set(file.name);
  }

  close(): void { this.closed.emit(); }

  confirm(): void {
    this.touched.set(true);
    if (!this.canConfirm()) return;
    this.confirmed.emit({
      reason: this.reason(),
      detail: this.detail().trim(),
      evidence: this.evidenceName() || this.evidenceUrl().trim()
    });
  }
}
