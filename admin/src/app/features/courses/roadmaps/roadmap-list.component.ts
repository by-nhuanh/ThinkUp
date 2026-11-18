import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ColumnFilterComponent, ColumnFilterValue, NUMBER_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { downloadTable } from '../../../shared/utils/export-formats';
import { formatNumber, paginationRange } from '../course-utils';
import { Roadmap } from '../models/course.models';
import { CourseStore } from '../services/course.store';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';

const PAGE_SIZE = 8;

type CoverageKey = '' | 'full' | 'partial';
type TestKey = '' | 'complete' | 'missing';
type VisibilityKey = '' | 'visible' | 'hidden';
type RoadmapColumn = 'name' | 'coverage' | 'test' | 'visibility';

const COVERAGE_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'full', label: 'Đầy đủ (100%)' },
  { value: 'partial', label: 'Còn thiếu (<100%)' }
];
const TEST_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'complete', label: 'Đủ bài test' },
  { value: 'missing', label: 'Thiếu bài test' }
];
const VISIBILITY_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'visible', label: 'Đang hiển thị' },
  { value: 'hidden', label: 'Đang ẩn' }
];

@Component({
  selector: 'app-roadmap-list',
  standalone: true,
  imports: [
    SearchFieldComponent,
    ColumnFilterComponent,
    CustomSelectComponent,
    ExportMenuComponent,
    CourseToastComponent,
    SelectionBarComponent,
    BulkSelectionDialogComponent
  ],
  templateUrl: './roadmap-list.component.html',
  styleUrls: ['../courses-page.css', './roadmap-list.component.css']
})
export class RoadmapListComponent {
  private readonly store = inject(CourseStore);
  private readonly router = inject(Router);

  readonly loadError = this.store.loadError;
  readonly roadmaps = this.store.roadmaps;

  readonly search = signal('');
  readonly industry = signal('');
  readonly coverage = signal<CoverageKey>('');
  readonly testState = signal<TestKey>('');
  readonly visibility = signal<VisibilityKey>('');
  private readonly columnFilters: Record<RoadmapColumn, WritableSignal<string[]>> = {
    name: signal<string[]>([]),
    coverage: signal<string[]>([]),
    test: signal<string[]>([]),
    visibility: signal<string[]>([])
  };
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;
  readonly menuId = signal<string | null>(null);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  private menuTrigger: HTMLElement | null = null;

  readonly totals = computed(() => {
    const items = this.roadmaps();
    const total = items.length;
    const active = items.filter((item) => !item.hidden).length;
    const learners = items.reduce((sum, item) => sum + item.learners, 0);
    const coverage = total ? items.reduce((sum, item) => sum + item.coverage, 0) / total : 0;
    const missingNodes = Math.round(items.reduce((sum, item) => sum + item.nodes * (100 - item.coverage) / 100, 0));
    return {
      total,
      active,
      activeShare: total ? Math.round((active / total) * 100) : 0,
      learners,
      coverage: `${coverage.toFixed(1).replace('.', ',')}%`,
      missingNodes
    };
  });

  readonly industryOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả nhóm ngành' },
    ...[...new Set(this.roadmaps().map(item => item.industry))].map(label => ({ value: label, label }))
  ];
  readonly coverageOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả độ phủ' },
    ...COVERAGE_FILTER_VALUES
  ];
  readonly testOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả bài kiểm tra' },
    ...TEST_FILTER_VALUES
  ];
  readonly visibilityOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    ...VISIBILITY_FILTER_VALUES
  ];

  readonly nameValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.roadmaps().map(item => item.name))].map(name => ({ value: name, label: name })));
  readonly coverageValues = COVERAGE_FILTER_VALUES;
  readonly testValues = TEST_FILTER_VALUES;
  readonly visibilityValues = VISIBILITY_FILTER_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly numberSorts = NUMBER_SORT_OPTIONS;
  readonly columnSort = signal<{ column: RoadmapColumn; direction: 'asc' | 'desc' } | null>(null);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const industry = this.industry();
    const coverage = this.coverage();
    const testState = this.testState();
    const visibility = this.visibility();
    const names = this.columnFilters.name();
    const coverages = this.columnFilters.coverage();
    const testStates = this.columnFilters.test();
    const visibilities = this.columnFilters.visibility();
    const items = this.roadmaps().filter(item => {
      const matches = !term
        || item.name.toLowerCase().includes(term)
        || item.code.toLowerCase().includes(term);
      const coverageOk = !coverage
        || (coverage === 'full' ? item.coverage >= 100 : item.coverage < 100);
      const testOk = !testState
        || (testState === 'complete' ? item.missingTests === 0 : item.missingTests > 0);
      const visibilityOk = !visibility
        || (visibility === 'hidden' ? item.hidden : !item.hidden);
      const columnStatus = item.hidden ? 'hidden' : 'visible';
      return matches
        && (!industry || item.industry === industry)
        && coverageOk
        && testOk
        && visibilityOk
        && (!names.length || names.includes(item.name))
        && (!coverages.length || coverages.includes(item.coverage >= 100 ? 'full' : 'partial'))
        && (!testStates.length || testStates.includes(item.missingTests === 0 ? 'complete' : 'missing'))
        && (!visibilities.length || visibilities.includes(columnStatus));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
  });
  readonly hasFilters = computed(() => Boolean(
    this.search() || this.industry() || this.coverage() || this.testState() || this.visibility()
    || this.columnFilters.name().length || this.columnFilters.coverage().length
    || this.columnFilters.test().length || this.columnFilters.visibility().length
  ));
  readonly resultTotal = computed(() => this.filtered().length);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.resultTotal() / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.visible().length;
    if (!total || !shown) return 'Không có lộ trình nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start}–${start + shown - 1} trong ${formatNumber(total)} lộ trình`;
  });
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.roadmaps()
    .filter(item => this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.name, detail: `${item.code} · ${item.industry}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.name, detail: `${item.code} · ${item.industry}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'publish', label: 'Xuất bản', tone: 'primary' },
    { key: 'hide', label: 'Ẩn lộ trình' },
    { key: 'export', label: 'Xuất đã chọn' }
  ]);

  isSelected(id: string): boolean { return this.selection().has(id); }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    checked ? next.add(id) : next.delete(id);
    this.selection.set(next);
  }

  toggleSelectAll(): void {
    const next = new Set(this.selection());
    if (this.allVisibleSelected()) this.visible().forEach(item => next.delete(item.id));
    else this.visible().forEach(item => next.add(item.id));
    this.selection.set(next);
  }

  clearSelection(): void { this.selection.set(new Set()); }

  setSelectionIds(ids: string[]): void { this.selection.set(new Set(ids)); }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    const targetIds = ids ?? this.selectedIds();
    if (!targetIds.length) return;
    if (key === 'export') { this.exportSelection(targetIds); return; }
    const chosen = new Set(targetIds);
    const targets = this.roadmaps().filter(item => chosen.has(item.id) && (key === 'publish' ? item.hidden : !item.hidden));
    if (!targets.length) {
      this.notify(key === 'publish' ? 'Các lộ trình đã chọn đều đang hiển thị.' : 'Các lộ trình đã chọn đều đang ẩn.', 'info');
      return;
    }
    targets.forEach(item => key === 'publish' ? this.store.publishRoadmap(item.id) : this.store.toggleRoadmapVisibility(item.id));
    this.clearSelection();
    this.notify(key === 'publish' ? `Đã xuất bản ${targets.length} lộ trình.` : `Đã ẩn ${targets.length} lộ trình.`, 'success');
  }

  private exportSelection(ids: readonly string[]): void {
    const chosen = new Set(ids);
    const rows: (string | number)[][] = [
      ['Mã lộ trình', 'Tên lộ trình', 'Nhóm ngành', 'Giai đoạn', 'Node', 'Học viên', 'Độ phủ (%)', 'Trạng thái'],
      ...this.roadmaps().filter(item => chosen.has(item.id)).map(item => [
        item.code, item.name, item.industry, item.stages, item.nodes, item.learners,
        item.coverage, item.hidden ? 'Đang ẩn' : 'Đang hiển thị'
      ])
    ];
    this.notify(`Đang tạo tệp XLSX cho ${ids.length} lộ trình đã chọn.`, 'info');
    void downloadTable('xlsx', 'lo-trinh-da-chon', rows)
      .then(() => this.notify(`Đã xuất ${ids.length} lộ trình đã chọn ra tệp XLSX.`, 'success'))
      .catch(() => this.notify('Không thể tạo tệp xuất. Vui lòng thử lại.', 'error'));
  }

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setIndustry(value: string): void { this.industry.set(value); this.page.set(1); }
  setCoverage(value: string): void { this.coverage.set(value as CoverageKey); this.page.set(1); }
  setTestState(value: string): void { this.testState.set(value as TestKey); this.page.set(1); }
  setVisibility(value: string): void { this.visibility.set(value as VisibilityKey); this.page.set(1); }

  filterFor(key: RoadmapColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: RoadmapColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.menuId.set(null);
    this.menuTrigger = null;
    this.page.set(1);
  }

  sortFor(key: RoadmapColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: RoadmapColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: Roadmap, column: RoadmapColumn): string | number {
    switch (column) {
      case 'name': return item.name;
      case 'coverage': return item.coverage;
      case 'test': return this.testLabel(item);
      case 'visibility': return item.nodes;
    }
  }

  resetFilters(): void {
    this.search.set('');
    this.industry.set('');
    this.coverage.set('');
    this.testState.set('');
    this.visibility.set('');
    this.columnFilters.name.set([]);
    this.columnFilters.coverage.set([]);
    this.columnFilters.test.set([]);
    this.columnFilters.visibility.set([]);
    this.columnSort.set(null);
    this.page.set(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
  }

  onPage(item: number | '...'): void {
    if (typeof item === 'number') this.goToPage(item);
  }

  openStudio(item: Roadmap): void {
    this.menuId.set(null);
    this.menuTrigger = null;
    void this.router.navigate(['/courses/roadmaps', item.id, 'studio']);
  }

  toggleMenu(item: Roadmap, event: MouseEvent): void {
    event.stopPropagation();
    this.menuId.set(this.menuId() === item.id ? null : item.id);
    this.menuTrigger = this.menuId() ? event.currentTarget as HTMLElement : null;
  }

  toggleVisibility(item: Roadmap): void {
    this.store.toggleRoadmapVisibility(item.id);
    this.menuId.set(null);
    this.menuTrigger = null;
    this.notify(item.hidden ? `Đã hiển thị lộ trình ${item.code}.` : `Đã ẩn lộ trình ${item.code}.`, 'success');
  }

  createRoadmap(): void {
    this.notify('Mẫu tạo lộ trình mới sẽ mở khi backend cung cấp API.', 'info');
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.resultTotal()} lộ trình.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.resultTotal()} lộ trình ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  number = formatNumber;

  decimal(value: number): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
  }

  testLabel(item: Roadmap): string {
    return item.missingTests === 0 ? 'Đủ bài test' : `Thiếu ${item.missingTests} bài test`;
  }

  @HostListener('document:click')
  closeMenu(): void {
    if (!this.menuId()) return;
    this.menuId.set(null);
    this.menuTrigger = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Escape phải trả focus về nút đã mở menu để người dùng bàn phím không bị mất vị trí.
    if (!this.menuId()) return;
    this.menuId.set(null);
    this.menuTrigger?.focus();
    this.menuTrigger = null;
  }
}
