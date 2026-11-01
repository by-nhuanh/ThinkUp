import {
  AfterViewInit,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  viewChild
} from '@angular/core';

export type UserModalSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Vỏ hộp thoại dùng chung cho module quản lý người dùng.
 *
 * Dùng `dialog` gốc của trình duyệt để có sẵn focus trap, đóng bằng Escape và
 * trả focus về phần tử đã mở hộp thoại (WCAG 2.4.3 / 2.1.2). Header và footer
 * đứng yên, chỉ phần thân cuộn — đúng quy ước modal của dự án.
 */
@Component({
  selector: 'app-user-modal',
  standalone: true,
  templateUrl: './user-modal.component.html',
  styleUrl: './user-modal.component.css'
})
export class UserModalComponent implements AfterViewInit, OnDestroy {
  private static sequence = 0;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly document = inject(DOCUMENT);
  private previousOverflow = '';

  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly size = input<UserModalSize>('md');
  /** Nhãn phụ cho trình đọc màn hình, ví dụ "Hộp thoại xử lý kỷ luật". */
  readonly describedBy = input('');
  readonly closed = output<void>();

  readonly titleId = `user-modal-title-${(UserModalComponent.sequence += 1)}`;
  readonly sizeClass = computed(() => `user-modal--${this.size()}`);

  ngAfterViewInit(): void {
    const dialog = this.dialogRef().nativeElement;
    if (!dialog.open) dialog.showModal();
    this.previousOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    const dialog = this.dialogRef().nativeElement;
    if (dialog.open) dialog.close();
    this.document.body.style.overflow = this.previousOverflow;
  }

  /** Click ra vùng nền (dialog phủ toàn viewport) sẽ đóng hộp thoại. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogRef().nativeElement) this.close();
  }

  /** Escape do trình duyệt phát ra; chặn mặc định để đóng qua Angular. */
  onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  close(): void {
    this.closed.emit();
  }
}
