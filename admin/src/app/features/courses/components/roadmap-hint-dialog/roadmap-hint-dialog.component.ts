import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { countChars } from '../../course-utils';

@Component({
  selector: 'app-roadmap-hint-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './roadmap-hint-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class RoadmapHintDialogComponent implements OnInit {
  readonly questionTitle = input.required<string>();
  readonly prompt = input('');
  readonly hint = input('');

  readonly closed = output<void>();
  readonly saved = output<string>();

  readonly draft = signal('');

  ngOnInit(): void {
    // Input signal chưa có giá trị ở giai đoạn khởi tạo field, nên đồng bộ ở đây.
    this.draft.set(this.hint() || this.suggest());
  }

  readonly charCount = computed(() => countChars(this.draft()));
  readonly canSave = computed(() => this.charCount() >= 10);

  regenerate(): void {
    this.draft.set(this.suggest());
  }

  save(): void {
    if (!this.canSave()) return;
    this.saved.emit(this.draft().trim());
  }

  private suggest(): string {
    const prompt = this.prompt().trim();
    const base = prompt
      ? `Đọc kỹ yêu cầu “${prompt}” và đối chiếu từng phương án với kiến thức đã học.`
      : 'Đọc kỹ nội dung câu hỏi và đối chiếu từng phương án với kiến thức đã học.';
    return `${base} Loại trừ phương án trái với đặc điểm của node hiện tại trước khi chọn đáp án cuối cùng.`;
  }
}
