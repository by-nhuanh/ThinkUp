import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  forwardRef,
  input,
  signal,
  viewChildren
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type OtpSize = 'xl' | 'lg' | 'md';

/**
 * Ô nhập mã xác thực dùng chung cho đăng nhập 2 bước, thiết lập 2FA và đổi mật khẩu.
 *
 * Ba kích thước lấy đúng từ Figma:
 * - `lg` 56×64 (màn hình xác thực 2 bước)
 * - `md` 56×48 (màn hình đổi mật khẩu)
 * - `xl` 104×53 (bước 3 của thiết lập 2FA)
 */
@Component({
  selector: 'app-otp-input',
  standalone: true,
  templateUrl: './otp-input.component.html',
  styleUrl: './otp-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => OtpInputComponent),
      multi: true
    }
  ]
})
export class OtpInputComponent implements ControlValueAccessor {
  readonly length = input(6);
  readonly size = input<OtpSize>('lg');
  readonly invalid = input(false);
  readonly autofocus = input(false);
  readonly ariaLabel = input('Mã xác thực');

  protected readonly digits = signal<string[]>(['', '', '', '', '', '']);
  protected readonly disabled = signal(false);
  protected readonly slots = computed(() => Array.from({ length: this.length() }, (_, index) => index));

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) this.focusSlot(0);
    });
  }

  writeValue(value: string | null): void {
    const next = (value ?? '').replace(/\D/g, '').slice(0, this.length()).split('');
    this.digits.set(Array.from({ length: this.length() }, (_, index) => next[index] ?? ''));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  /** Đưa con trỏ về ô đầu tiên (dùng sau khi hiển thị lỗi). */
  focusFirst(): void {
    this.focusSlot(0);
  }

  protected onInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const typed = input.value.replace(/\D/g, '');

    if (!typed) {
      this.setDigit(index, '');
      return;
    }

    this.fill(typed, index);
    this.focusSlot(Math.min(index + typed.length, this.length() - 1));
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.digits()[index]) {
        this.setDigit(index, '');
        return;
      }
      if (index > 0) {
        this.setDigit(index - 1, '');
        this.focusSlot(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusSlot(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < this.length() - 1) {
      event.preventDefault();
      this.focusSlot(index + 1);
      return;
    }

    if (event.key.length === 1 && !/\d/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
    }
  }

  protected onPaste(event: ClipboardEvent, index: number): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const pasted = text.replace(/\D/g, '');
    if (!pasted) return;

    event.preventDefault();
    this.fill(pasted, index);
    this.focusSlot(Math.min(index + pasted.length, this.length() - 1));
  }

  protected onFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  protected onBlur(): void {
    this.onTouched();
  }

  private fill(text: string, start: number): void {
    const next = [...this.digits()];
    for (let offset = 0; offset < text.length && start + offset < this.length(); offset += 1) {
      next[start + offset] = text[offset];
    }
    this.digits.set(next);
    this.onChange(next.join(''));
  }

  private setDigit(index: number, value: string): void {
    const next = [...this.digits()];
    next[index] = value.slice(-1);
    this.digits.set(next);
    this.onChange(next.join(''));
  }

  private focusSlot(index: number): void {
    const target = this.boxes()[index]?.nativeElement;
    if (!target) return;
    target.focus();
    target.select();
  }
}
