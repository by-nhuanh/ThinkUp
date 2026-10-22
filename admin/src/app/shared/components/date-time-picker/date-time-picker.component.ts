import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

type PickerMode = 'date' | 'datetime';
type PickerPanel = 'days' | 'months' | 'years';

@Component({
  selector: 'app-date-time-picker',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './date-time-picker.component.html',
  styleUrl: './date-time-picker.component.css'
})
export class DateTimePickerComponent {
  @Input() value = '';
  @Input() mode: PickerMode = 'date';
  @Input() label = 'Chọn ngày';
  @Input() disabled = false;
  @Input() controlId = '';
  /** Nút "Hôm nay" trong footer của lịch. Bật/tắt theo ngữ cảnh dùng. */
  @Input() showToday = true;
  @Output() readonly valueChange = new EventEmitter<string>();

  open = false;
  month = this.currentMonth();
  popoverPosition = { left: 12, top: 12, maxHeight: 640 };
  draftDate = '';
  draftHour = '00';
  draftMinute = '00';
  draftSecond = '00';
  panel: PickerPanel = 'days';
  yearCursor = new Date().getFullYear();
  yearRangeStart = Math.floor(new Date().getFullYear() / 12) * 12;
  readonly weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  readonly hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
  readonly minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
  readonly monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  get days(): Array<number | null> {
    const [year, month] = this.month.split('-').map(Number);
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => index >= offset && index < offset + count ? index - offset + 1 : null);
  }

  get monthLabel(): string {
    const [year, month] = this.month.split('-').map(Number);
    return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  get yearOptions(): number[] {
    return Array.from({ length: 12 }, (_, index) => this.yearRangeStart + index);
  }

  get yearRangeLabel(): string {
    return `${this.yearRangeStart} – ${this.yearRangeStart + 11}`;
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }

  get displayValue(): string {
    if (!this.value) return this.label;
    const date = this.formatDate(this.value.slice(0, 10));
    if (this.mode === 'date') return date;
    const rawTime = this.value.slice(11, 19);
    const time = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
    return `${date} · ${time}`;
  }

  toggle(): void {
    if (this.disabled) return;
    if (!this.open) {
      this.prepareDraft();
      this.open = true;
      setTimeout(() => this.positionPopover());
      return;
    }
    this.open = !this.open;
  }

  positionPopover(): void {
    if (!this.open) return;
    const trigger = this.host.nativeElement.querySelector('button')?.getBoundingClientRect();
    const popover = this.host.nativeElement.querySelector<HTMLElement>('.picker-popover');
    if (!trigger || !popover) return;
    const margin = 12;
    const gap = 7;
    const width = Math.min(popover.offsetWidth, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - margin - width));
    const below = window.innerHeight - trigger.bottom - gap - margin;
    const above = trigger.top - gap - margin;
    const openAbove = below < popover.offsetHeight && above > below;
    const maxHeight = Math.max(120, openAbove ? above : below);
    const top = openAbove
      ? Math.max(margin, trigger.top - Math.min(popover.offsetHeight, maxHeight) - gap)
      : trigger.bottom + gap;
    this.popoverPosition = { left, top, maxHeight };
  }

  prepareDraft(): void {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.draftDate = this.value.slice(0, 10) || today;
    this.month = this.draftDate.slice(0, 7);
    this.draftHour = this.value.slice(11, 13) || '00';
    this.draftMinute = this.value.slice(14, 16) || '00';
    this.draftSecond = this.value.slice(17, 19) || '00';
    this.panel = 'days';
    this.yearCursor = Number(this.month.slice(0, 4));
    this.yearRangeStart = Math.floor(this.yearCursor / 12) * 12;
  }

  shiftMonth(offset: number): void {
    const [year, month] = this.month.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    this.month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    this.yearCursor = Number(this.month.slice(0, 4));
  }

  openMonths(): void {
    this.yearCursor = Number(this.month.slice(0, 4));
    this.panel = 'months';
  }

  openYears(): void {
    this.yearCursor = Number(this.month.slice(0, 4));
    this.yearRangeStart = Math.floor(this.yearCursor / 12) * 12;
    this.panel = 'years';
  }

  shiftYear(offset: number): void {
    this.yearCursor += offset;
  }

  shiftYearRange(offset: number): void {
    this.yearRangeStart += offset * 12;
  }

  chooseYear(year: number): void {
    this.yearCursor = year;
    this.panel = 'months';
  }

  chooseMonth(month: number): void {
    this.month = `${this.yearCursor}-${String(month).padStart(2, '0')}`;
    this.draftDate = `${this.month}-01`;
    this.panel = 'days';
  }

  isSelectedMonth(month: number): boolean {
    return this.month === `${this.yearCursor}-${String(month).padStart(2, '0')}`;
  }

  monthName(month: number): string {
    return `Tháng ${month}`;
  }

  chooseDay(day: number | null): void {
    if (day === null) return;
    this.draftDate = `${this.month}-${String(day).padStart(2, '0')}`;
    if (this.mode === 'date') this.apply();
  }

  selectToday(): void {
    const now = new Date();
    this.draftDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.month = this.draftDate.slice(0, 7);
    this.yearCursor = Number(this.month.slice(0, 4));
    if (this.mode === 'date') this.apply();
  }

  apply(): void {
    if (!this.draftDate) return;
    const value = this.mode === 'datetime'
      ? `${this.draftDate}T${this.draftHour}:${this.draftMinute}:${this.draftSecond}`
      : this.draftDate;
    this.valueChange.emit(value);
    this.open = false;
  }

  close(): void { this.open = false; }

  isSelected(day: number | null): boolean {
    return day !== null && `${this.month}-${String(day).padStart(2, '0')}` === this.draftDate;
  }

  formatDate(value: string): string {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    // composedPath giữ lại đường đi của event tại thời điểm dispatch, nên các nút bị
    // Angular thay thế khi đổi panel (tháng/năm) vẫn được tính là bấm trong component.
    if (this.open && !event.composedPath().includes(this.host.nativeElement)) this.close();
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void { this.close(); }

  @HostListener('window:resize')
  repositionOnResize(): void { this.positionPopover(); }

  @HostListener('window:scroll')
  repositionOnWindowScroll(): void { this.positionPopover(); }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
