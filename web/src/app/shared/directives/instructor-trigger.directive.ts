import { Directive, ElementRef, HostListener, computed, inject, input, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { InstructorService } from '../../core/services/instructor.service';
import { InstructorCardService } from '../../core/services/instructor-card.service';

const HOVER_INTENT_MS = 180;

/**
 * Gắn vào tên/khu vực giảng viên của một khóa học.
 * - Hover (giữ chuột ~180ms) hoặc focus bàn phím: mở popup nổi dạng Facebook.
 * - Click/Enter/Space: mở popup dạng ghim, có CTA "Xem thông tin giảng viên".
 * - Click luôn chặn sự kiện để không kích hoạt link/khóa học phía sau.
 */
@Directive({
  selector: '[appInstructorTrigger]',
  standalone: true,
  host: {
    class: 'instructor-trigger',
    role: 'button',
    tabindex: '0',
    '[attr.aria-haspopup]': '"dialog"',
    '[attr.aria-expanded]': 'isOpen() ? "true" : "false"',
    '[class.instructor-trigger--active]': 'isOpen()',
  },
})
export class InstructorTriggerDirective implements OnDestroy {
  readonly appInstructorTrigger = input.required<string>();

  private readonly instructorService = inject(InstructorService);
  private readonly cardService = inject(InstructorCardService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private loadVersion = 0;
  private hoverTimer?: ReturnType<typeof setTimeout>;

  readonly isOpen = computed(() => this.cardService.state()?.trigger === this.host.nativeElement);

  ngOnDestroy(): void {
    this.loadVersion++;
    this.clearHoverTimer();
  }

  @HostListener('mouseenter')
  onMouseEnter(): void {
    if (this.isOpen()) {
      this.cardService.cancelClose();
      return;
    }
    this.clearHoverTimer();
    this.hoverTimer = setTimeout(() => this.show(false), HOVER_INTENT_MS);
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.loadVersion++;
    this.clearHoverTimer();
    this.cardService.scheduleClose();
  }

  @HostListener('focus')
  onFocus(): void {
    if (this.cardService.consumeFocusSuppression(this.host.nativeElement)) return;
    if (!this.host.nativeElement.matches(':focus-visible')) return;
    this.show(false);
  }

  @HostListener('blur')
  onBlur(): void {
    this.loadVersion++;
    this.clearHoverTimer();
    this.cardService.scheduleClose();
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.clearHoverTimer();
    this.cardService.close();
    const ref = this.appInstructorTrigger();
    if (ref) {
      this.router.navigate(['/instructors', ref]);
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.clearHoverTimer();
      this.cardService.close();
      const ref = this.appInstructorTrigger();
      if (ref) {
        this.router.navigate(['/instructors', ref]);
      }
      return;
    }
    if (event.key === 'Escape' && this.isOpen()) {
      event.stopPropagation();
      this.cardService.close();
    }
  }

  private show(pinned: boolean, openedByKeyboard = false): void {
    const version = ++this.loadVersion;
    this.instructorService.loadProfile(this.appInstructorTrigger()).subscribe({
      next: ({ instructor }) => {
        if (version !== this.loadVersion) return;
        this.cardService.open(instructor, this.host.nativeElement, { pinned, openedByKeyboard });
      },
      error: () => { /* Keep the popup closed when the public profile cannot be loaded. */ },
    });
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = undefined;
    }
  }
}
