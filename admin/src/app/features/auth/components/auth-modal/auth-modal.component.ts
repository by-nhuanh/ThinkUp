import {
  Component,
  ElementRef,
  DOCUMENT,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
  OnDestroy
} from '@angular/core';

/**
 * Khung hộp thoại dùng cho các thông báo của luồng đăng nhập
 * (tạm khoá đăng nhập, hướng dẫn quên mật khẩu).
 */
@Component({
  selector: 'app-auth-modal',
  standalone: true,
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.css'
})
export class AuthModalComponent implements OnDestroy {
  readonly ariaLabel = input.required<string>();
  readonly cardWidth = input('620px');
  readonly cardRadius = input('16px');
  /** Cho phép đóng bằng phím Esc / bấm nền. Hộp thoại tạm khoá để mặc định `false`. */
  readonly dismissible = input(false);

  readonly closed = output<void>();

  protected readonly card = viewChild<ElementRef<HTMLElement>>('card');

  protected readonly cardStyle = computed(() => ({
    '--modal-width': this.cardWidth(),
    '--modal-radius': this.cardRadius()
  }));

  private readonly document = inject(DOCUMENT);
  private previousFocus: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      this.previousFocus = this.document.activeElement as HTMLElement | null;
      this.card()?.nativeElement.focus();
      this.document.body.style.overflow = 'hidden';
    });
  }

  ngOnDestroy(): void {
    this.document.body.style.overflow = '';
    this.previousFocus?.focus?.();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (!this.dismissible()) return;
    if (event.target !== event.currentTarget) return;
    this.closed.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.dismissible()) return;
    event.stopPropagation();
    this.closed.emit();
  }
}
