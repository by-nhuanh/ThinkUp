import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { InstructorCardService } from '../../../core/services/instructor-card.service';

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;

@Component({
  selector: 'app-instructor-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './instructor-card.component.html',
  styleUrl: './instructor-card.component.css',
})
export class InstructorCardComponent implements OnInit, OnDestroy {
  private readonly cardService = inject(InstructorCardService);
  private readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');

  readonly state = this.cardService.state;
  readonly position = signal({ left: 0, top: 0 });
  readonly positioned = signal(false);

  private focusAfterPosition = false;

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const current = this.state();
    if (!current) return;
    const target = event.target as Node | null;
    if (!target) return;
    const card = this.cardRef()?.nativeElement;
    if (card?.contains(target)) return;
    if (current.trigger.contains(target)) return;
    this.cardService.close();
  };

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    const current = this.state();
    if (!current || event.key !== 'Escape') return;
    event.stopPropagation();
    this.cardService.close();
    this.cardService.suppressNextFocus(current.trigger);
    current.trigger.focus();
  };

  private readonly onDocumentScroll = (event: Event): void => {
    const current = this.state();
    if (!current) return;
    const card = this.cardRef()?.nativeElement;
    const target = event.target as Node | null;
    if (card && target && card.contains(target)) return;
    this.cardService.close();
  };

  constructor() {
    effect(() => {
      const current = this.state();
      this.positioned.set(false);
      if (!current) return;
      this.focusAfterPosition = current.openedByKeyboard;
      requestAnimationFrame(() => this.measureAndPlace());
    });
  }

  ngOnInit(): void {
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.addEventListener('keydown', this.onDocumentKeydown, true);
    document.addEventListener('scroll', this.onDocumentScroll, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.removeEventListener('keydown', this.onDocumentKeydown, true);
    document.removeEventListener('scroll', this.onDocumentScroll, true);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.state()) return;
    requestAnimationFrame(() => this.measureAndPlace());
  }

  onMouseEnter(): void {
    this.cardService.cancelClose();
  }

  onMouseLeave(): void {
    this.cardService.scheduleClose();
  }

  close(): void {
    this.cardService.close();
  }

  formatCount(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  formatRating(value: number): string {
    return Number.isFinite(value) ? value.toFixed(1) : '0.0';
  }

  private measureAndPlace(): void {
    const current = this.state();
    const card = this.cardRef()?.nativeElement;
    if (!current || !card) return;

    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { anchor } = current;

    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN));

    let top = anchor.bottom + ANCHOR_GAP;
    if (top + height > viewportHeight - VIEWPORT_MARGIN) {
      const above = anchor.top - ANCHOR_GAP - height;
      top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
    }

    this.position.set({ left: Math.round(left), top: Math.round(top) });
    this.positioned.set(true);

    if (this.focusAfterPosition) {
      this.focusAfterPosition = false;
      card.querySelector<HTMLElement>('[data-popover-cta]')?.focus();
    }
  }
}
