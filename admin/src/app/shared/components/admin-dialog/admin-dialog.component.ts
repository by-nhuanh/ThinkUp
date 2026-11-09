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

export type AdminDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'settings';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Dialog shell dùng chung cho các overlay của layout admin (hồ sơ, cấu hình).
 *
 * Dùng `dialog` gốc của trình duyệt để có focus trap và đóng bằng Escape.
 * Component tự lưu phần tử đã mở hộp thoại để trả focus khi đóng (WCAG 2.4.3),
 * khoá cuộn nền, và giữ header/footer cố định — chỉ phần thân cuộn.
 *
 * Pattern được chép từ `user-modal` (feature users) để layout không phải import
 * component thuộc feature khác. TODO: hợp nhất hai shell sau khi nhánh users merge main.
 */
@Component({
  selector: 'app-admin-dialog',
  standalone: true,
  templateUrl: './admin-dialog.component.html',
  styleUrl: './admin-dialog.component.css'
})
export class AdminDialogComponent implements AfterViewInit, OnDestroy {
  private static sequence = 0;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly document = inject(DOCUMENT);
  private opener: HTMLElement | null = null;
  private dialogEl: HTMLDialogElement | null = null;
  private previousOverflow = '';

  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** Path SVG tuỳ chọn hiển thị cạnh tiêu đề (dùng cho các hộp thoại nghiệp vụ hệ thống). */
  readonly icon = input('');
  readonly size = input<AdminDialogSize>('md');
  /** Bỏ padding thân để nội dung tự dựng bố cục toàn khung (ví dụ settings 2 cột). */
  readonly flushBody = input(false);
  readonly closed = output<void>();

  readonly titleId = `admin-dialog-title-${(AdminDialogComponent.sequence += 1)}`;
  readonly sizeClass = computed(() => `admin-dialog--${this.size()}`);

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
