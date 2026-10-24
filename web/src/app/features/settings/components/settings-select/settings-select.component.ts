import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface SettingsSelectOption {
  value: string;
  label: string;
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number | null;
  scrollable: boolean;
}

/**
 * Select dùng chung cho các trang cài đặt.
 * Khớp Figma node 3200:23104: cao 44px, bo 10px, chữ 14/20 #314158, chevron 16px #90A1B9.
 *
 * Danh sách dùng position: fixed để luôn nổi lên trên (kể cả footer), không bị cắt bởi
 * vùng cuộn của trang và không làm tăng chiều cao trang (không sinh thanh cuộn).
 * Tự mở lên trên khi không đủ chỗ bên dưới.
 */
@Component({
  selector: 'app-settings-select',
  standalone: true,
  imports: [LucideChevronDown, LucideCheck],
  templateUrl: './settings-select.component.html',
  styleUrl: './settings-select.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(window:scroll)': 'onViewportChange()',
    '(window:resize)': 'onViewportChange()',
  },
})
export class SettingsSelectComponent {
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly value = model<string>('');
  readonly options = input<SettingsSelectOption[]>([]);
  readonly disabled = input<boolean>(false);
  readonly change = output<string>();
  readonly placeholder = input<string>('Chọn...');

  readonly open = model<boolean>(false);
  readonly position = signal<PanelPosition>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: null,
    scrollable: false,
  });

  /** Nhãn hiển thị của giá trị đang chọn (value lưu mã, label lưu chữ hiển thị). */
  readonly selectedLabel = computed(() => {
    const current = this.value();
    return this.options().find((option) => option.value === current)?.label ?? current;
  });

  toggle(): void {
    if (this.disabled()) return;

    const next = !this.open();
    if (next) this.updatePosition();
    this.open.set(next);
  }

  onOption(value: string): void {
    this.value.set(value);
    this.open.set(false);
    this.change.emit(value);
  }

  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) return;
    if (!this.hostElement.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  onEscape(): void {
    if (this.open()) this.open.set(false);
  }

  /** Giữ danh sách bám theo select khi trang cuộn hoặc đổi kích thước cửa sổ. */
  onViewportChange(): void {
    if (this.open()) this.updatePosition();
  }

  /**
   * Tính vị trí cố định cho danh sách: ưu tiên mở xuống, mở lên khi thiếu chỗ,
   * và không vượt quá mép màn hình.
   */
  private updatePosition(): void {
    const element = this.trigger()?.nativeElement;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    // Chiều cao tự nhiên: 40px mỗi option + 8px padding dọc + 2px border.
    const naturalHeight = this.options().length * 40 + 10;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUpwards = spaceBelow < naturalHeight && spaceAbove > spaceBelow;
    const available = Math.max(0, openUpwards ? spaceAbove : spaceBelow);
    // Chỉ đặt max-height khi thật sự thiếu chỗ; nếu vừa đủ thì để panel cao tự nhiên,
    // nhờ vậy không bao giờ sinh thanh cuộn cho danh sách 4-6 lựa chọn.
    const fits = available >= naturalHeight;
    const maxHeight = fits ? null : Math.max(120, available);
    const desiredTop = openUpwards ? rect.top - 4 - (maxHeight ?? naturalHeight) : rect.bottom + 4;
    const top = Math.max(8, desiredTop);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));

    this.position.set({ top, left, width: rect.width, maxHeight, scrollable: !fits });
  }
}
