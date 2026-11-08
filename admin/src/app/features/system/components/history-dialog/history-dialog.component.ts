import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { AdminHistoryEntry, AdminPerson } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';

@Component({
  selector: 'app-system-history-dialog',
  standalone: true,
  imports: [AdminDialogComponent, CustomSelectComponent],
  templateUrl: './history-dialog.component.html',
  styleUrls: ['../../system-page.css', './history-dialog.component.css']
})
export class HistoryDialogComponent {
  private readonly store = inject(SYSTEM_STORE);

  readonly person = input.required<AdminPerson>();
  readonly closed = output<void>();
  readonly inspect = output<AdminHistoryEntry>();

  readonly targetFilter = signal<string | null>(null);
  readonly actionFilter = signal('all');
  readonly page = signal(1);

  readonly viewingTarget = computed(() => this.targetFilter() ?? this.person().email);
  readonly actionOptions = computed(() => {
    const actions = Array.from(new Set(this.store.history().map((entry) => entry.action)));
    return [{ value: 'all', label: 'Tất cả hành động' }, ...actions.map((action) => ({ value: action, label: action }))];
  });

  readonly filtered = computed(() => this.store.history().filter((entry) => {
    const target = this.viewingTarget();
    if (target && entry.targetEmail !== target) return false;
    if (this.actionFilter() !== 'all' && entry.action !== this.actionFilter()) return false;
    return true;
  }));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 5)));
  readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly paged = computed(() => this.filtered().slice((this.safePage() - 1) * 5, this.safePage() * 5));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có sự kiện nào · Nhật ký được lưu bất biến';
    const start = (this.safePage() - 1) * 5 + 1;
    return `Hiển thị ${start}–${Math.min(start + 4, total)} trong ${total} sự kiện · Nhật ký được lưu bất biến`;
  });

  clearTarget(): void {
    this.targetFilter.set('');
    this.page.set(1);
  }

  setAction(value: string): void {
    this.actionFilter.set(value);
    this.page.set(1);
  }

  resetFilters(): void {
    this.targetFilter.set(null);
    this.actionFilter.set('all');
    this.page.set(1);
  }

  goToPage(value: number): void {
    if (value >= 1 && value <= this.totalPages()) this.page.set(value);
  }

  initials(name: string): string {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toUpperCase();
  }
}