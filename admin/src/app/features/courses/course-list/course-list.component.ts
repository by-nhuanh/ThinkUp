import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ColumnFilterComponent, ColumnFilterValue, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { downloadTable } from '../../../shared/utils/export-formats';
import { formatCurrency, formatDate, formatNumber, formatTime, paginationRange } from '../course-utils';
import { Course, CourseLevel, CourseStatus } from '../models/course.models';
import { CourseStore } from '../services/course.store';
import { CourseArchiveDialogComponent, ArchivePayload } from '../components/course-archive-dialog/course-archive-dialog.component';
import { CourseDetailDialogComponent } from '../components/course-detail-dialog/course-detail-dialog.component';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';

const PLATFORM_TOTAL = 1248;

const CATEGORIES = [
  'Frontend Developer', 'Backend Developer', 'Fullstack Developer', 'Mobile Developer',
  'Software Tester', 'Quality Assurance', 'Business Analyst', 'Project Manager',
  'Product Owner', 'DevOps Engineer', 'Cloud Engineer', 'Data Analyst',
  'Data Engineer', 'Data Scientist', 'Artificial Intelligence', 'Product Designer',
  'ERP Consultant', 'System Analyst', 'Security Engineer'
];

type RangeKey = '' | '7' | '30' | '90';
type CourseColumn = 'title' | 'category' | 'instructor' | 'status';

const LEVEL_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'Cơ bản', label: 'Cơ bản' },
  { value: 'Trung cấp', label: 'Trung cấp' },
  { value: 'Nâng cao', label: 'Nâng cao' }
];
const STATUS_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'published', label: 'Đang xuất bản' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'hidden', label: 'Tạm ẩn' },
  { value: 'archived', label: 'Đã lưu trữ' }
];

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [
    RouterLink,
    SearchFieldComponent,
    ColumnFilterComponent,
    CustomSelectComponent,
    ExportMenuComponent,
    CourseDetailDialogComponent,
    CourseArchiveDialogComponent,
    CourseToastComponent,
    SelectionBarComponent,
    BulkSelectionDialogComponent
  ],
  templateUrl: './course-list.component.html',
  styleUrls: ['../courses-page.css', './course-list.component.css']
})
export class CourseListComponent {
  private readonly store = inject(CourseStore);
  private readonly router = inject(Router);

  readonly loadError = this.store.loadError;
  readonly rowMenu = signal<{ item: Course; top: number; left: number } | null>(null);
  private rowMenuTrigger: HTMLElement | null = null;

  readonly courses = this.store.courses;

  readonly search = signal('');
  readonly category = signal('');
  readonly level = signal('');
  readonly status = signal<'' | CourseStatus>('');
  readonly createdRange = signal<RangeKey>('');
  private readonly columnFilters: Record<CourseColumn, WritableSignal<string[]>> = {
    title: signal<string[]>([]),
    category: signal<string[]>([]),
    instructor: signal<string[]>([]),
    status: signal<string[]>([])
  };
  readonly page = signal(1);
  readonly pageSize = 200;
  readonly detailId = signal<string | null>(null);
  readonly archiveId = signal<string | null>(null);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);

  readonly totals = { total: PLATFORM_TOTAL, published: 980, pending: 36, archived: 232 };

  readonly categoryOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả danh mục' },
    ...CATEGORIES.map(label => ({ value: label, label }))
  ];
  readonly levelOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả cấp độ' },
    ...LEVEL_FILTER_VALUES
  ];
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    ...STATUS_FILTER_VALUES
  ];
  readonly rangeOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả thời gian' },
    { value: '7', label: '7 ngày gần đây' },
    { value: '30', label: '30 ngày gần đây' },
    { value: '90', label: '90 ngày gần đây' }
  ];

  readonly titleValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.courses().map(item => item.title))].map(title => ({ value: title, label: title })));
  readonly categoryValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.courses().map(item => item.category))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(category => ({ value: category, label: category })));
  readonly instructorValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.courses().map(item => item.instructor))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(instructor => ({ value: instructor, label: instructor })));
  readonly levelValues = LEVEL_FILTER_VALUES;
  readonly statusValues = STATUS_FILTER_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly columnSort = signal<{ column: CourseColumn; direction: 'asc' | 'desc' } | null>(null);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.category();
    const level = this.level();
    const status = this.status();
    const days = Number(this.createdRange());
    const cutoff = days ? Date.now() - days * 86_400_000 : 0;
    const titles = this.columnFilters.title();
    const categories = this.columnFilters.category();
    const instructors = this.columnFilters.instructor();
    const statuses = this.columnFilters.status();
    const items = this.courses().filter(item => {
      const matches = !term
        || item.id.toLowerCase().includes(term)
        || item.title.toLowerCase().includes(term)
        || item.instructor.toLowerCase().includes(term);
      const recent = !cutoff || Date.parse(item.createdAt) >= cutoff;
      return matches && recent
        && (!category || item.category === category)
        && (!level || item.level === level)
        && (!status || item.status === status)
        && (!titles.length || titles.includes(item.title))
        && (!categories.length || categories.includes(item.category))
        && (!instructors.length || instructors.includes(item.instructor))
        && (!statuses.length || statuses.includes(item.status));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.resultTotal() / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly hasFilters = computed(() => Boolean(
    this.search() || this.category() || this.level() || this.status() || this.createdRange()
    || this.columnFilters.title().length || this.columnFilters.category().length
    || this.columnFilters.instructor().length || this.columnFilters.status().length
  ));
  readonly resultTotal = computed(() => this.hasFilters() ? this.filtered().length : PLATFORM_TOTAL);
  readonly rangeLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.visible().length;
    if (!total || !shown) return 'Không có khóa học nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start}–${start + shown - 1} trong ${formatNumber(total)} khóa học`;
  });
  readonly detail = computed(() => this.courses().find(item => item.id === this.detailId()) ?? null);
  readonly archiveTarget = computed(() => this.courses().find(item => item.id === this.archiveId()) ?? null);
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.courses()
    .filter(item => this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.title, detail: `${item.id} · ${item.instructor}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.title, detail: `${item.id} · ${item.instructor}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'hide', label: 'Ẩn khóa học' },
    { key: 'show', label: 'Hiện khóa học' },
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
    const status: CourseStatus = key === 'hide' ? 'hidden' : 'published';
    targetIds.forEach(id => this.store.setCourseStatus(id, status));
    this.clearSelection();
    this.notify(key === 'hide' ? `Đã ẩn ${targetIds.length} khóa học.` : `Đã hiển thị ${targetIds.length} khóa học.`, 'success');
  }

  private exportSelection(ids: readonly string[]): void {
    const chosen = new Set(ids);
    const rows: (string | number)[][] = [
      ['Mã khóa học', 'Tên khóa học', 'Giảng viên', 'Danh mục', 'Cấp độ', 'Trạng thái', 'Giá bán', 'Học viên'],
      ...this.courses().filter(item => chosen.has(item.id)).map(item => [
        item.id, item.title, item.instructor, item.category, item.level,
        this.statusText(item.status), item.price, item.students ?? 0
      ])
    ];
    this.notify(`Đang tạo tệp XLSX cho ${ids.length} khóa học đã chọn.`, 'info');
    void downloadTable('xlsx', 'khoa-hoc-da-chon', rows)
      .then(() => this.notify(`Đã xuất ${ids.length} khóa học đã chọn ra tệp XLSX.`, 'success'))
      .catch(() => this.notify('Không thể tạo tệp xuất. Vui lòng thử lại.', 'error'));
  }

  isRowMenuOpen(id: string): boolean { return this.rowMenu()?.item.id === id; }

  openRowMenu(event: MouseEvent | KeyboardEvent, item: Course): void {
    event.stopPropagation();
    if (this.rowMenu()?.item.id === item.id) { this.closeRowMenu(); return; }
    this.rowMenuTrigger = event.currentTarget as HTMLElement;
    const rect = this.rowMenuTrigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(260, window.innerWidth - margin * 2);
    const count = 1 + (this.canArchive(item.status) ? 1 : 0);
    const height = Math.min(count * 42 + 16, window.innerHeight - margin * 2);
    const below = window.innerHeight - rect.bottom - 6 - margin;
    const top = Math.max(margin, below >= height ? rect.bottom + 6 : rect.top - 6 - height);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.rowMenu.set({ item, top, left });
    setTimeout(() => {
      if (this.rowMenu()?.item.id === item.id) document.querySelector<HTMLButtonElement>('#course-row-menu button')?.focus();
    });
  }

  openRowMenuFromKeyboard(event: Event, item: Course): void {
    if (!(event instanceof KeyboardEvent)) return;
    event.preventDefault();
    if (!this.isRowMenuOpen(item.id)) this.openRowMenu(event, item);
  }

  closeRowMenu(): void {
    if (!this.rowMenu()) return;
    this.rowMenu.set(null);
    this.rowMenuTrigger?.focus({ preventScroll: true });
  }

  onRowMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closeRowMenu(); return; }
    if (event.key === 'Tab') { this.closeRowMenu(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }

  @HostListener('window:resize')
  onMenuResize(): void { this.closeRowMenu(); }

  @HostListener('window:scroll')
  onMenuScroll(): void { this.closeRowMenu(); }

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setCategory(value: string): void { this.category.set(value); this.page.set(1); }
  setLevel(value: string): void { this.level.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value as '' | CourseStatus); this.page.set(1); }
  setRange(value: string): void { this.createdRange.set(value as RangeKey); this.page.set(1); }

  filterFor(key: CourseColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: CourseColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
  }

  sortFor(key: CourseColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: CourseColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: Course, column: CourseColumn): string | number {
    switch (column) {
      case 'title': return item.title;
      case 'category': return item.category;
      case 'instructor': return item.instructor;
      case 'status': return this.statusText(item.status);
    }
  }

  resetFilters(): void {
    this.search.set('');
    this.category.set('');
    this.level.set('');
    this.status.set('');
    this.createdRange.set('');
    this.columnFilters.title.set([]);
    this.columnFilters.category.set([]);
    this.columnFilters.instructor.set([]);
    this.columnFilters.status.set([]);
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

  openDetail(item: Course): void {
    this.detailId.set(item.id);
  }

  closeDetail(): void {
    this.detailId.set(null);
  }

  openArchive(item: Course): void {
    this.archiveId.set(item.id);
  }

  closeArchive(): void {
    this.archiveId.set(null);
  }

  confirmArchive(payload: ArchivePayload): void {
    const target = this.archiveTarget();
    if (!target) return;
    this.store.archiveCourse(target.id, payload.reason, payload.explanation);
    this.archiveId.set(null);
    this.detailId.set(null);
    this.notify(`Đã lưu trữ khóa học ${target.id}.`, 'success');
  }

  inspectCourse(item: Course): void {
    if (item.status === 'pending') {
      void this.router.navigate(['/courses/approvals']);
      return;
    }
    this.openDetail(item);
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.resultTotal()} khóa học.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.resultTotal()} khóa học ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusText(status: CourseStatus): string {
    return status === 'published' ? 'Đang xuất bản'
      : status === 'pending' ? 'Chờ duyệt'
      : status === 'hidden' ? 'Tạm ẩn'
      : 'Đã lưu trữ';
  }

  statusTone(status: CourseStatus): string {
    return status === 'published' ? 'success'
      : status === 'pending' ? 'pending'
      : status === 'hidden' ? 'warning'
      : 'neutral';
  }

  levelText(level: CourseLevel): string { return level; }
  levelTone(level: CourseLevel): string {
    return level === 'Cơ bản' ? 'info' : level === 'Trung cấp' ? 'pending' : 'danger';
  }

  canArchive(status: CourseStatus): boolean {
    return status === 'published' || status === 'hidden';
  }

  money = formatCurrency;
  number = formatNumber;
  date = formatDate;
  time = formatTime;
}
