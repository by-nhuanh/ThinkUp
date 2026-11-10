import { Component, ElementRef, effect, input, output, signal, viewChildren } from '@angular/core';

const OTP_LENGTH = 6;

/**
 * Ô nhập mã xác thực 6 số dạng 6 hộp riêng (theo thiết kế Figma).
 * Hỗ trợ dán mã, xoá lùi, điều hướng bằng phím mũi tên và giữ focus hợp lý.
 */
@Component({
  selector: 'app-system-otp-input',
  standalone: true,
  templateUrl: './otp-input.component.html',
  styleUrl: './otp-input.component.css'
})
export class SystemOtpInputComponent {
  readonly value = input('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly autofocus = input(false);
  readonly valueChange = output<string>();

  protected readonly positions = Array.from({ length: OTP_LENGTH }, (_, index) => index);
  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');
  private readonly digits = signal<string[]>(Array<string>(OTP_LENGTH).fill(''));

  constructor() {
    effect(() => {
      const external = this.value().replace(/\D/g, '').slice(0, OTP_LENGTH);
      if (external === this.digits().join('')) return;
      const next = Array<string>(OTP_LENGTH).fill('');
      for (let index = 0; index < external.length; index += 1) next[index] = external[index];
      this.digits.set(next);
    });

    effect(() => {
      if (!this.autofocus() || this.disabled()) return;
      queueMicrotask(() => this.focusBox(0));
    });
  }

  protected digitAt(index: number): string {
    return this.digits()[index] ?? '';
  }

  protected onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    if (!raw) {
      this.setDigit(index, '');
      return;
    }
    if (raw.length > 1) {
      this.fillFrom(index, raw);
      return;
    }
    this.setDigit(index, raw);
    if (index < OTP_LENGTH - 1) this.focusBox(index + 1);
  }

  protected onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digitAt(index) && index > 0) {
      event.preventDefault();
      this.setDigit(index - 1, '');
      this.focusBox(index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault();
      this.focusBox(index + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.focusBox(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.focusBox(OTP_LENGTH - 1);
    }
  }

  protected onPaste(index: number, event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!text) return;
    event.preventDefault();
    this.fillFrom(index, text);
  }

  protected selectBox(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  private setDigit(index: number, digit: string): void {
    const next = [...this.digits()];
    next[index] = digit;
    this.digits.set(next);
    this.valueChange.emit(next.join(''));
  }

  private fillFrom(start: number, text: string): void {
    const incoming = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!incoming) return;
    const next = [...this.digits()];
    let cursor = start;
    for (const char of incoming) {
      if (cursor >= OTP_LENGTH) break;
      next[cursor] = char;
      cursor += 1;
    }
    this.digits.set(next);
    this.valueChange.emit(next.join(''));
    this.focusBox(Math.min(cursor, OTP_LENGTH - 1));
  }

  private focusBox(index: number): void {
    const input = this.boxes()[index]?.nativeElement;
    input?.focus();
    input?.select();
  }
}
