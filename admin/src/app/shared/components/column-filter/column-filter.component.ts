import { Component, HostListener, computed, input, output, signal } from '@angular/core';

export interface ColumnFilterValue {
  value: string;
  label: string;
}

/** Một nhóm giá trị trong popup lọc chung của cột ghép nhiều trường (kiểu Excel). */
export interface ColumnFilterSection {
  key: string;
  title: string;
  values: readonly ColumnFilterValue[];
  selected: readonly string[];
}

/** Một lựa chọn sắp xếp trong popup lọc cột (kiểu Excel). */
export interface ColumnSortOption {
  key: string;
  label: string;
  direction: 'asc' | 'desc';
}

export const DATE_SORT_OPTIONS: readonly ColumnSortOption[] = [
  { key: 'desc', label: 'Gần nhất → Xa nhất', direction: 'desc' },
  { key: 'asc', label: 'Xa nhất → Gần nhất', direction: 'asc' }
];

export const NUMBER_SORT_OPTIONS: readonly ColumnSortOption[] = [
  { key: 'desc', label: 'Cao → Thấp', direction: 'desc' },
  { key: 'asc', label: 'Thấp → Cao', direction: 'asc' }
];

export const TEXT_SORT_OPTIONS: readonly ColumnSortOption[] = [
  { key: 'asc', label: 'A → Z', direction: 'asc' },
  { key: 'desc', label: 'Z → A', direction: 'desc' }
];

export function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true });
}

@Component({
  selector: 'app-column-filter',
  standalone: true,
  templateUrl: './column-filter.component.html',
  styleUrl: './column-filter.component.css'
})
export class ColumnFilterComponent {
  readonly label = input('');
  readonly title = input('');
  readonly values = input<readonly ColumnFilterValue[]>([]);
  readonly selected = input<readonly string[]>([]);
  readonly sections = input<readonly ColumnFilterSection[]>([]);
  readonly sorts = input<readonly ColumnSortOption[]>([]);
  readonly sort = input('');
  readonly changed = output<string[]>();
  readonly sectionChanged = output<{ key: string; values: string[] }>();
  readonly sortChange = output<string>();

  readonly open = signal(false);
  readonly position = signal<{ top: number; left: number } | null>(null);

  readonly grouped = computed(() => this.sections().length > 0);
  readonly selectedCount = computed(() => this.grouped()
    ? this.sections().reduce((total, section) => total + section.selected.length, 0)
    : this.selected().length);
  readonly allSelected = computed(() => {
    const values = this.values();
    return values.length > 0 && values.every((item) => this.selected().includes(item.value));
  });
  readonly someSelected = computed(() => this.selected().length > 0 && !this.allSelected());
  readonly heading = computed(() => this.title() || this.label() || 'Bộ lọc');
  readonly sortDirection = computed(() => this.sorts().find((option) => option.key === this.sort())?.direction ?? null);

  toggle(event: MouseEvent): void {
    if (this.open()) {
      this.close();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const margin = 12, gap = 6;
    const width = Math.min(this.grouped() ? 292 : 250, window.innerWidth - margin * 2);
    const height = Math.min((this.grouped() ? 460 : 360) + (this.sorts().length ? 92 : 0), window.innerHeight - margin * 2);
    const below = window.innerHeight - rect.bottom - gap - margin;
    this.position.set({
      left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)),
      top: Math.max(margin, below >= height ? rect.bottom + gap : rect.top - gap - height)
    });
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  toggleValue(value: string, checked: boolean): void {
    const current = this.selected();
    this.changed.emit(checked ? [...current, value] : current.filter((item) => item !== value));
  }

  toggleAll(checked: boolean): void {
    this.changed.emit(checked ? this.values().map((item) => item.value) : []);
  }

  sectionAllSelected(section: ColumnFilterSection): boolean {
    return section.values.length > 0 && section.values.every((item) => section.selected.includes(item.value));
  }

  sectionSomeSelected(section: ColumnFilterSection): boolean {
    return section.selected.length > 0 && !this.sectionAllSelected(section);
  }

  toggleSectionValue(section: ColumnFilterSection, value: string, checked: boolean): void {
    this.sectionChanged.emit({
      key: section.key,
      values: checked ? [...section.selected, value] : section.selected.filter((item) => item !== value)
    });
  }

  toggleSectionAll(section: ColumnFilterSection, checked: boolean): void {
    this.sectionChanged.emit({ key: section.key, values: checked ? section.values.map((item) => item.value) : [] });
  }

  toggleSort(key: string): void {
    this.sortChange.emit(this.sort() === key ? '' : key);
  }

  clear(): void {
    if (this.grouped()) {
      this.sections().forEach((section) => this.sectionChanged.emit({ key: section.key, values: [] }));
      return;
    }
    this.changed.emit([]);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('document:scroll', ['$event'])
  onScroll(event: Event): void {
    if (event.target instanceof Element && event.target.closest('.column-filter-menu')) return;
    this.close();
  }
}
