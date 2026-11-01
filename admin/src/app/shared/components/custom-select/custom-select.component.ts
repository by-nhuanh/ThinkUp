import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, inject, signal } from '@angular/core';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Canonical dropdown for the entire admin application.
 * UI rule: user-facing admin dropdowns must use this component instead of native `<select>`
 * so trigger, menu, typography, focus, hover and keyboard behaviour stay consistent.
 * Keep native `<select>` only when the operating-system picker is an explicit requirement.
 */
@Component({
  selector: 'app-custom-select',
  standalone: true,
  templateUrl: './custom-select.component.html',
  styleUrl: './custom-select.component.css'
})
export class CustomSelectComponent implements OnDestroy {
  private static activeInstance: CustomSelectComponent | null = null;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly reposition = () => this.positionMenu();

  @Input() value = '';
  @Input() options: ReadonlyArray<CustomSelectOption> = [];
  @Input() placeholder = 'Tất cả';
  @Input() labelId = '';
  @Input() controlId = '';
  @Input() menuWidth = 188;
  @Input() menuMaxHeight = 0;
  @Input() menuPlacement: 'bottom' | 'top' = 'bottom';
  @Input() disabled = false;
  @Output() readonly valueChange = new EventEmitter<string>();

  readonly open = signal(false);
  readonly activeIndex = signal(-1);
  readonly menuPosition = signal<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  get displayLabel(): string {
    return this.options.find(option => option.value === this.value)?.label ?? this.placeholder;
  }

  get valueId(): string {
    return this.controlId ? `${this.controlId}-value` : '';
  }

  toggle(): void {
    if (this.disabled) return;
    if (this.open()) {
      this.close();
      return;
    }

    CustomSelectComponent.activeInstance?.close();
    CustomSelectComponent.activeInstance = this;
    this.open.set(true);
    this.activeIndex.set(Math.max(0, this.options.findIndex(option => option.value === this.value && !option.disabled)));
    document.addEventListener('scroll', this.reposition, true);
    setTimeout(() => {
      const menu = this.menu();
      if (menu && typeof menu.showPopover === 'function' && !menu.matches(':popover-open')) menu.showPopover();
      this.positionMenu();
      this.focusActiveOption();
    });
  }

  choose(value: string): void {
    this.valueChange.emit(value);
    this.close(true);
  }

  close(returnFocus = false): void {
    const menu = this.menu();
    if (menu && typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) menu.hidePopover();
    this.open.set(false);
    this.menuPosition.set(null);
    document.removeEventListener('scroll', this.reposition, true);
    if (CustomSelectComponent.activeInstance === this) {
      CustomSelectComponent.activeInstance = null;
    }
    if (returnFocus) setTimeout(() => this.trigger()?.focus());
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (!this.open()) this.toggle();
    else if (event.key === 'Enter' || event.key === ' ') this.chooseActive();
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') { this.close(); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.chooseActive(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = this.options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (!enabled.length) return;
    const current = enabled.indexOf(this.activeIndex());
    const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : event.key === 'ArrowDown' ? enabled[(current + 1 + enabled.length) % enabled.length] : enabled[(current - 1 + enabled.length) % enabled.length];
    this.activeIndex.set(next); this.focusActiveOption();
  }

  @HostListener('window:resize') onResize(): void { if (this.open()) this.positionMenu(); }

  ngOnDestroy(): void {
    this.close();
  }

  private trigger(): HTMLButtonElement | null { return this.host.nativeElement.querySelector('.custom-select-trigger'); }
  private menu(): (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null { return this.host.nativeElement.querySelector('.custom-select-menu'); }
  private focusActiveOption(): void { setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-option-index="${this.activeIndex()}"]`)?.focus()); }
  private chooseActive(): void { const option = this.options[this.activeIndex()]; if (option && !option.disabled) this.choose(option.value); }
  private positionMenu(): void {
    const trigger = this.trigger(); if (!trigger) return;
    const rect = trigger.getBoundingClientRect(), margin = 12, gap = 6;
    const width = Math.min(Math.max(rect.width, this.menuWidth), window.innerWidth - margin * 2);
    const below = window.innerHeight - rect.bottom - gap - margin, above = rect.top - gap - margin;
    const openAbove = this.menuPlacement === 'top' || (below < 220 && above > below);
    const available = Math.max(120, openAbove ? above : below);
    const preferred = this.menuMaxHeight || 320, maxHeight = Math.min(preferred, available);
    const top = openAbove ? Math.max(margin, rect.top - gap - maxHeight) : rect.bottom + gap;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width));
    this.menuPosition.set({ top, left, width, maxHeight });
  }
}
