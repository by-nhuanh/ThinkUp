import {
  Component,
  DOCUMENT,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { toIsoDate, todayIso } from '../../user-management.utils';

interface RangePosition {
  left: number;
  top: number;
  maxHeight: number;
}

const PRESETS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: '7 ngày gần nhất' },
  { key: 'month', label: 'Tháng này' },
  { key: 'quarter', label: 'Quý này' },
  { key: 'year', label: 'Năm nay' }
] as const;

/**
 * Chọn khoảng thời gian cho thanh lọc.
 *
 * Dùng `input[type=date]` gốc để giữ khả năng truy cập và bàn phím của trình duyệt;
 * popover tự đo khoảng trống còn lại, mở lên trên khi phía dưới không đủ chỗ và
 * luôn giữ trong lề an toàn — theo quy ước overlay của dự án.
 */
@Component({
  selector: 'app-user-date-range',
  standalone: true,
  templateUrl: './user-date-range.component.html',
  styleUrl: './user-date-range.component.css'
})
export class UserDateRangeComponent implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private popoverObserver?: ResizeObserver;

  readonly label = input('Thời gian');
  readonly from = input('');
  readonly to = input('');
  readonly rangeChange = output<{ from: string; to: string }>();

  readonly open = signal(false);
  readonly fromDraft = signal('');
  readonly toDraft = signal('');
  readonly activePreset = signal<string>('');
  readonly popoverPosition = signal<RangePosition | null>(null);
  readonly presets = PRESETS;

  readonly displayLabel = computed(() => {
    const from = this.from();
    const to = this.to();
    if (!from && !to) return 'Khoảng thời gian';
    return `${from ? this.short(from) : '...'} – ${to ? this.short(to) : '...'}`;
  });

  readonly hasValue = computed(() => !!(this.from() || this.to()));

  private readonly reposition = (): void => this.measure();

  ngOnDestroy(): void {
    this.popoverObserver?.disconnect();
    this.removeListeners();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close(true);
  }

  /** Đóng khi bấm ra ngoài; trigger nằm trong host nên không tự đóng. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.close(false);
  }

  onInput(kind: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (kind === 'from') this.setFrom(value);
    else this.setTo(value);
  }

  toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.fromDraft.set(this.from());
    this.toDraft.set(this.to());
    this.activePreset.set('');
    this.popoverPosition.set(null);
    this.open.set(true);
    const view = this.document.defaultView;
    view?.addEventListener('resize', this.reposition);
    view?.addEventListener('scroll', this.reposition, true);
    // Đo sau khi popover đã vào DOM; setTimeout cũ chạy trước render nên đo trượt.
    afterNextRender(
      () => {
        if (!this.open()) return;
        this.measure();
        this.observePopover();
        // Popover chỉ hiện sau khi có toạ độ (visibility), nên phải chờ thêm một
        // vòng render nữa mới focus được preset đầu tiên.
        afterNextRender(
          () => {
            if (this.open()) this.focusFirstPreset();
          },
          { injector: this.injector }
        );
      },
      { injector: this.injector }
    );
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    this.popoverPosition.set(null);
    this.popoverObserver?.disconnect();
    this.popoverObserver = undefined;
    this.removeListeners();
    if (!restoreFocus) return;
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.range-trigger');
    if (trigger?.isConnected) trigger.focus();
  }

  setFrom(value: string): void {
    this.fromDraft.set(value);
    if (this.toDraft() && value > this.toDraft()) this.toDraft.set(value);
    this.activePreset.set('');
  }

  setTo(value: string): void {
    this.toDraft.set(value);
    if (this.fromDraft() && value < this.fromDraft()) this.fromDraft.set(value);
    this.activePreset.set('');
  }

  applyPreset(key: string): void {
    const range = this.rangeFor(key);
    this.fromDraft.set(range.from);
    this.toDraft.set(range.to);
    this.activePreset.set(key);
  }

  reset(): void {
    this.fromDraft.set('');
    this.toDraft.set('');
    this.activePreset.set('');
    this.rangeChange.emit({ from: '', to: '' });
    this.close(true);
  }

  apply(): void {
    this.rangeChange.emit({ from: this.fromDraft(), to: this.toDraft() });
    this.close(true);
  }

  /** dd/mm/yyyy cho nhãn hiển thị; nhận cả giá trị ISO từ input date. */
  short(value: string): string {
    if (!value) return '';
    if (value.includes('/')) return value;
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  /** Đổi giá trị ISO (yyyy-mm-dd) sang dd/mm/yyyy khi hiển thị trong input. */
  toDisplay(value: string): string {
    return toIsoDate(value) || value;
  }

  private measure(): void {
    if (!this.open()) return;
    const view = this.document.defaultView;
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.range-trigger');
    const popover = this.host.nativeElement.querySelector<HTMLElement>('.range-popover');
    if (!view || !trigger || !popover) return;

    const margin = 12;
    const gap = 8;
    const rect = trigger.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    // scrollHeight giữ chiều cao thật kể cả khi max-height đã kẹp popover.
    const height = Math.max(box.height, popover.scrollHeight);
    const width = Math.min(box.width || 320, view.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, view.innerWidth - margin - width));
    const below = view.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const openAbove = height > below && above > below;
    const maxHeight = Math.max(200, openAbove ? above : below);
    const top = openAbove
      ? Math.max(margin, rect.top - gap - Math.min(height, maxHeight))
      : rect.bottom + gap;

    const current = this.popoverPosition();
    if (current && current.left === left && current.top === top && current.maxHeight === maxHeight) return;
    this.popoverPosition.set({ left, top, maxHeight });
  }

  private focusFirstPreset(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.range-presets button')?.focus();
  }

  /** Popover có thể đổi kích thước khi đổi preset / nội dung, nên đo lại. */
  private observePopover(): void {
    const view = this.document.defaultView;
    const popover = this.host.nativeElement.querySelector<HTMLElement>('.range-popover');
    if (!view || !popover || typeof view.ResizeObserver !== 'function') return;
    this.popoverObserver?.disconnect();
    this.popoverObserver = new view.ResizeObserver(() => this.measure());
    this.popoverObserver.observe(popover);
  }

  private removeListeners(): void {
    const view = this.document.defaultView;
    view?.removeEventListener('resize', this.reposition);
    view?.removeEventListener('scroll', this.reposition, true);
  }

  private rangeFor(key: string): { from: string; to: string } {
    const now = new Date();
    const iso = (date: Date): string =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    if (key === 'today') return { from: todayIso(), to: todayIso() };
    if (key === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { from: iso(start), to: todayIso() };
    }
    if (key === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayIso() };
    if (key === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: todayIso() };
    if (key === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: todayIso() };
    return { from: '', to: '' };
  }
}
