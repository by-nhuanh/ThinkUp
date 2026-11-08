import { Component, computed, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { countChars } from '../../course-utils';
import { ApprovalWorkspace } from '../../models/course.models';

export interface SupplementPayload {
  items: string[];
  issueType: string;
  detail: string;
}

const ITEMS = [
  { id: 'info', label: 'Thông tin khóa học' },
  { id: 'video', label: 'Video / Bài đọc' },
  { id: 'ide', label: 'Bài tập lập trình (IDE)' },
  { id: 'quiz', label: 'Bài kiểm tra (Quiz)' },
  { id: 'docs', label: 'Tài liệu đính kèm' },
  { id: 'price', label: 'Giá bán / Chứng chỉ' }
];

const ISSUE_TYPES: CustomSelectOption[] = [
  { value: 'Nội dung thiếu hoặc chưa đạt', label: 'Nội dung thiếu hoặc chưa đạt' },
  { value: 'Lỗi kỹ thuật video', label: 'Lỗi kỹ thuật video' },
  { value: 'Test case / quiz chưa đạt', label: 'Test case / quiz chưa đạt' },
  { value: 'Tài liệu không an toàn', label: 'Tài liệu không an toàn' },
  { value: 'Giá bán chưa phù hợp', label: 'Giá bán chưa phù hợp' },
  { value: 'Khác', label: 'Khác' }
];

@Component({
  selector: 'app-course-supplement-dialog',
  standalone: true,
  imports: [AdminDialogComponent, CustomSelectComponent],
  templateUrl: './course-supplement-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class CourseSupplementDialogComponent {
  readonly workspace = input.required<ApprovalWorkspace>();
  readonly closed = output<void>();
  readonly confirmed = output<SupplementPayload>();

  readonly items = ITEMS;
  readonly issueTypes = ISSUE_TYPES;
  readonly selected = signal<ReadonlySet<string>>(new Set(['video', 'ide']));
  readonly issueType = signal('');
  readonly detail = signal('');
  readonly touched = signal(false);

  readonly charCount = computed(() => countChars(this.detail()));
  readonly detailError = computed(() => this.touched() && this.charCount() < 20
    ? `Cần thêm ${20 - this.charCount()} ký tự để đạt tối thiểu 20.`
    : '');
  readonly canConfirm = computed(() => this.selected().size > 0 && Boolean(this.issueType()) && this.charCount() >= 20);

  toggleItem(id: string): void {
    const next = new Set(this.selected());
    next.has(id) ? next.delete(id) : next.add(id);
    this.selected.set(next);
  }

  isSelected(id: string): boolean { return this.selected().has(id); }
  setIssueType(value: string): void { this.issueType.set(value); }
  setDetail(value: string): void { this.detail.set(value); }
  close(): void { this.closed.emit(); }

  confirm(): void {
    this.touched.set(true);
    if (!this.canConfirm()) return;
    const labels = ITEMS.filter(item => this.selected().has(item.id)).map(item => item.label);
    this.confirmed.emit({ items: labels, issueType: this.issueType(), detail: this.detail().trim() });
  }
}
