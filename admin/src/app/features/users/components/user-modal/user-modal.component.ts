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

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Vỏ hộp thoại dùng chung cho module quản lý người dùng.
 *
 * Dùng `dialog` gốc của trình duyệt để có sẵn focus trap và đóng bằng Escape.
 * Component tự lưu phần tử đã mở hộp thoại để trả focus khi đóng (WCAG 2.4.3),
 * khoá cuộn nền, và giữ header/footer cố định — chỉ phần thân cuộn.
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
  private opener: HTMLElement | null = null;
  private dialogEl: HTMLDialogElement | null = null;
  private previousOverflow = '';

  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly size = input<UserModalSize>('md');
  readonly closed = output<void>();

  readonly titleId = `user-modal-title-${(UserModalComponent.sequence += 1)}`;
  readonly sizeClass = computed(() => `user-modal--${this.size()}`);

  ngAfterViewInit(): void {
    this.opener = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    const dialog = this.dialogRef().nativeElement;
    this.dialogEl = dialog;
    if (!dialog.open) dialog.showModal();
    this.previousOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    this.focusInitialControl(dialog);
  }

  ngOnDestroy(): void {
    // View đã bị huỷ khi ngOnDestroy chạy nên dùng tham chiếu đã lưu.
    if (this.dialogEl?.open) this.dialogEl.close();
    this.document.body.style.overflow = this.previousOverflow;
    if (this.opener?.isConnected) this.opener.focus();
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
    const dialog = this.dialogRef().nativeElement;
    if (dialog.open) dialog.close();
    this.closed.emit();
  }

  private focusInitialControl(dialog: HTMLDialogElement): void {
    const target = dialog.querySelector<HTMLElement>('[autofocus]')
      ?? dialog.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  }
}
