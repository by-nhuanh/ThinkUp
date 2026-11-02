import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { LucideX } from '@lucide/angular';

@Component({
  selector: 'app-support-filter-modal',
  standalone: true,
  imports: [LucideX],
  templateUrl: './support-filter-modal.component.html',
  styleUrl: './support-filter-modal.component.css'
})
export class SupportFilterModalComponent implements AfterViewInit {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  @Input() resultCount = 0;
  @Input() applyDisabled = false;
  @Output() closed = new EventEmitter<void>();
  @Output() cleared = new EventEmitter<void>();
  @Output() applied = new EventEmitter<void>();

  ngAfterViewInit(): void { setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.support-filter-close')?.focus()); }
  close(): void { this.closed.emit(); setTimeout(() => this.origin?.focus()); }

  @HostListener('document:keydown.escape') onEscape(): void { this.close(); }
  @HostListener('document:keydown.tab', ['$event']) trapFocus(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    const controls = Array.from(this.host.nativeElement.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')) as HTMLElement[];
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus(); }
    else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus(); }
  }
}
