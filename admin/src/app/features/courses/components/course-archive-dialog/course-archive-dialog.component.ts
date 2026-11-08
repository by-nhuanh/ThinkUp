import { Component, computed, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { countChars } from '../../course-utils';
import { Course } from '../../models/course.models';

export interface ArchivePayload {
  reason: string;
  explanation: string;
  evidence: string;
}

const REASONS: CustomSelectOption[] = [
  { value: 'Nội dung lỗi thời', label: 'Nội dung lỗi thời' },
  { value: 'Vi phạm nghiêm trọng', label: 'Vi phạm nghiêm trọng' },
  { value: 'Tranh chấp bản quyền', label: 'Tranh chấp bản quyền' },
  { value: 'Phản hồi tiêu cực', label: 'Phản hồi tiêu cực' },
  { value: 'Khác', label: 'Khác' }
];

@Component({
  selector: 'app-course-archive-dialog',
  standalone: true,
  imports: [AdminDialogComponent, CustomSelectComponent],
  templateUrl: './course-archive-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class CourseArchiveDialogComponent {
  readonly course = input.required<Course>();
  readonly closed = output<void>();
  readonly confirmed = output<ArchivePayload>();

  readonly reasons = REASONS;
  readonly reason = signal('');
  readonly explanation = signal('');
  readonly evidenceName = signal('');
  readonly evidenceUrl = signal('');
  readonly touched = signal(false);

  readonly charCount = computed(() => countChars(this.explanation()));
  readonly explanationError = computed(() => this.touched() && this.charCount() < 30
    ? `Cần thêm ${30 - this.charCount()} ký tự để đạt tối thiểu 30.`
    : '');
  readonly canConfirm = computed(() => Boolean(this.reason()) && this.charCount() >= 30);

  setReason(value: string): void {
    this.reason.set(value);
  }

  setExplanation(value: string): void {
    this.explanation.set(value);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      this.evidenceName.set('Tệp vượt quá 20 MB, vui lòng chọn tệp khác.');
      input.value = '';
      return;
    }
    this.evidenceName.set(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`);
  }

  confirm(): void {
    this.touched.set(true);
    if (!this.canConfirm()) return;
    this.confirmed.emit({
      reason: this.reason(),
      explanation: this.explanation().trim(),
      evidence: this.evidenceName() || this.evidenceUrl().trim()
    });
  }

  close(): void {
    this.closed.emit();
  }
}
