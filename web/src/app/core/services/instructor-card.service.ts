import { Injectable, signal } from '@angular/core';
import { Instructor } from '../models/instructor.model';

export interface InstructorCardAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface InstructorCardState {
  instructor: Instructor;
  anchor: InstructorCardAnchor;
  trigger: HTMLElement;
  /** true khi mở bằng click/Enter: card không tự đóng khi rê chuột ra ngoài. */
  pinned: boolean;
  /** true khi mở bằng bàn phím: đưa focus vào CTA của card. */
  openedByKeyboard: boolean;
}

const CLOSE_DELAY_MS = 200;

/**
 * Điều phối MỘT popup giảng viên duy nhất cho toàn bộ ứng dụng.
 * Popup render ở app shell với position: fixed nên không đẩy layout của trang.
 */
@Injectable({ providedIn: 'root' })
export class InstructorCardService {
  readonly state = signal<InstructorCardState | null>(null);

  private closeTimer?: ReturnType<typeof setTimeout>;
  private suppressFocusFor?: HTMLElement;

  open(
    instructor: Instructor,
    trigger: HTMLElement,
    options: { pinned?: boolean; openedByKeyboard?: boolean } = {}
  ): void {
    this.cancelClose();
    const rect = trigger.getBoundingClientRect();
    this.state.set({
      instructor,
      trigger,
      anchor: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      pinned: options.pinned === true,
      openedByKeyboard: options.openedByKeyboard === true,
    });
  }

  /** Giữ popup mở trong lúc con trỏ còn ở vùng giảng viên hoặc trong popup. */
  cancelClose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = undefined;
    }
  }

  scheduleClose(): void {
    if (this.state()?.pinned) return;
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(), CLOSE_DELAY_MS);
  }

  close(): void {
    this.cancelClose();
    this.state.set(null);
  }

  /** Chặn popup tự mở lại khi Escape trả focus về đúng trigger vừa đóng. */
  suppressNextFocus(trigger: HTMLElement): void {
    this.suppressFocusFor = trigger;
    setTimeout(() => {
      if (this.suppressFocusFor === trigger) this.suppressFocusFor = undefined;
    }, 0);
  }

  consumeFocusSuppression(trigger: HTMLElement): boolean {
    if (this.suppressFocusFor !== trigger) return false;
    this.suppressFocusFor = undefined;
    return true;
  }
}
