import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { AdminHistoryEntry, AdminPerson } from '../models/system.models';
import { SYSTEM_STORE } from '../data/system.store';
import { SystemToastService } from '../services/system-toast.service';
import { SystemToastComponent } from '../components/system-toast/system-toast.component';
import { RoleDialogComponent, RoleDialogResult } from '../components/role-dialog/role-dialog.component';
import { AccountDialogComponent, AccountDialogKind } from '../components/account-dialog/account-dialog.component';
import { BulkAccountDialogComponent } from '../components/bulk-account-dialog/bulk-account-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SelectionAction } from '../../../shared/components/selection-bar/selection-bar.component';
import { HistoryDialogComponent } from '../components/history-dialog/history-dialog.component';
import { HistoryDetailDialogComponent } from '../components/history-detail-dialog/history-detail-dialog.component';

type SecurityColumn = 'name' | 'role' | 'twofa' | 'login' | 'status';

const STATUS_FILTER_VALUES = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'locked', label: 'Tạm khóa' },
  { value: 'unverified', label: 'Chưa xác minh' }
];
const TWOFA_FILTER_VALUES = [
  { value: 'active', label: 'Đã kích hoạt' },
  { value: 'inactive', label: 'Chưa kích hoạt' }
];
const MULTI_OPTION = '__multi';

@Component({
  selector: 'app-system-security',
  standalone: true,
  imports: [
    CustomSelectComponent,
    ColumnFilterComponent,
    SearchFieldComponent,
    ExportMenuComponent,
    SystemToastComponent,
    RoleDialogComponent,
    AccountDialogComponent,
    BulkAccountDialogComponent,
    BulkSelectionDialogComponent,
    HistoryDialogComponent,
    HistoryDetailDialogComponent
  ],
  templateUrl: './security.component.html',
  styleUrls: ['../system-page.css', './security.component.css', '../system-list-support.css']
})
export class SecurityComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(SYSTEM_STORE);
  private readonly toast = inject(SystemToastService);

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly denied = computed(() => this.queryParams()?.get('denied') === '1');

  readonly search = signal('');
  private readonly columnFilters: Record<SecurityColumn, WritableSignal<string[]>> = {
    name: signal<string[]>([]),
    role: signal<string[]>([]),
    twofa: signal<string[]>([]),
    login: signal<string[]>([]),
    status: signal<string[]>([])
  };
  readonly page = signal(1);
  readonly rowMenuId = signal<string | null>(null);
  readonly menuPosition = signal<{ top: number; left: number; width: number } | null>(null);
  readonly menuPerson = computed(() => this.store.admins().find(person => person.id === this.rowMenuId() && !person.isSelf) ?? null);
  private menuTrigger: HTMLElement | null = null;

  readonly assignOpen = signal(false);
  readonly accountAction = signal<{ kind: AccountDialogKind; person: AdminPerson } | null>(null);
  readonly bulkAction = signal<AccountDialogKind | null>(null);
  readonly changeTarget = signal<AdminPerson | null>(null);
  readonly historyPerson = signal<AdminPerson | null>(null);
  readonly historyDetail = signal<AdminHistoryEntry | null>(null);

  readonly selectedIds = signal<string[]>([]);
  readonly selectablePeople = computed(() => this.filtered().filter((person) => !person.isSelf));
  readonly selectedPeople = computed(() => this.selectedIds()
    .map((id) => this.store.admins().find((person) => person.id === id && !person.isSelf))
    .filter((person): person is AdminPerson => !!person));
  readonly selectedCount = computed(() => this.selectedPeople().length);
  readonly allSelected = computed(() => {
    const items = this.selectablePeople();
    return items.length > 0 && items.every((person) => this.selectedIds().includes(person.id));
  });
  readonly someSelected = computed(() => this.selectedCount() > 0 && !this.allSelected());
  readonly canLockSelected = computed(() => this.selectedPeople().some((person) => person.status !== 'locked'));
  readonly canUnlockSelected = computed(() => this.selectedPeople().some((person) => person.status === 'locked'));
  readonly canResetSelected = computed(() => this.selectedPeople().some((person) => person.twoFactor === 'active'));
  readonly bulkPeople = computed(() => {
    const kind = this.bulkAction();
    if (!kind) return [];
    return this.selectedPeople().filter((person) => kind === 'lock'
      ? person.status !== 'locked'
      : kind === 'unlock'
        ? person.status === 'locked'
        : person.twoFactor === 'active');
  });
  readonly selectionListOpen = signal(false);
  readonly selectionDialogItems = computed<BulkSelectionItem[]>(() => this.selectedPeople()
    .map((person) => ({ id: person.id, label: person.name, detail: person.email })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.selectablePeople()
    .filter((person) => !this.selectedIds().includes(person.id))
    .map((person) => ({ id: person.id, label: person.name, detail: person.email })));
  readonly selectionDialogActions = computed<readonly SelectionAction[]>(() => [
    { key: 'lock', label: 'Khóa tài khoản', tone: 'danger' },
    { key: 'unlock', label: 'Mở khóa tài khoản' },
    { key: 'reset', label: 'Đặt lại 2FA' }
  ]);

  readonly roleOptions = computed<CustomSelectOption[]>(() => [
    { value: '', label: 'Tất cả vai trò' },
    ...this.store.roles.map((role) => ({ value: role.code, label: role.label.split(' (')[0] })),
    ...this.multiOption(this.columnFilters.role(), 'vai trò')
  ]);
  readonly statusOptions = computed<CustomSelectOption[]>(() => [
    { value: '', label: 'Tất cả trạng thái' },
    ...STATUS_FILTER_VALUES,
    ...this.multiOption(this.columnFilters.status(), 'trạng thái')
  ]);
  readonly twofaOptions = computed<CustomSelectOption[]>(() => [
    { value: '', label: 'Tất cả 2FA' },
    ...TWOFA_FILTER_VALUES,
    ...this.multiOption(this.columnFilters.twofa(), 'trạng thái 2FA')
  ]);
  readonly roleValue = computed(() => this.selectValue(this.columnFilters.role()));
  readonly statusValue = computed(() => this.selectValue(this.columnFilters.status()));
  readonly twofaValue = computed(() => this.selectValue(this.columnFilters.twofa()));
  readonly nameValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.store.admins().map((person) => person.name))].map((name) => ({ value: name, label: name })));
  readonly roleValues: ColumnFilterValue[] = this.store.roles.map((role) => ({ value: role.code, label: role.label.split(' (')[0] }));
  readonly twofaValues = TWOFA_FILTER_VALUES;
  readonly statusValues = STATUS_FILTER_VALUES;
  readonly loginValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.store.admins().map((person) => loginDate(person.lastLoginAt)))].map((date) => ({ value: date, label: date })));
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: SecurityColumn; direction: 'asc' | 'desc' } | null>(null);

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const names = this.columnFilters.name();
    const roles = this.columnFilters.role();
    const statuses = this.columnFilters.status();
    const twofas = this.columnFilters.twofa();
    const logins = this.columnFilters.login();
    const items = this.store.admins().filter((person) => {
      if (query && !`${person.name} ${person.email} ${person.code}`.toLowerCase().includes(query)) return false;
      if (names.length && !names.includes(person.name)) return false;
      if (roles.length && !roles.includes(person.role)) return false;
      if (statuses.length && !statuses.includes(person.status)) return false;
      if (twofas.length && !twofas.includes(person.twoFactor)) return false;
      if (logins.length && !logins.includes(loginDate(person.lastLoginAt))) return false;
      return true;
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 5)));
  readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly paged = computed(() => this.filtered().slice((this.safePage() - 1) * 5, this.safePage() * 5));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có tài khoản nào';
    const start = (this.safePage() - 1) * 5 + 1;
    return `Hiển thị ${start}–${Math.min(start + 4, total)} trong ${total} tài khoản quản trị`;
  });
  readonly pageItems = computed(() => {
    const last = this.totalPages();
    const current = this.safePage();
    if (last <= 5) return Array.from({ length: last }, (_, index) => index + 1);
    if (current <= 3) return [1, 2, 3, '…', last];
    if (current >= last - 2) return [1, '…', last - 2, last - 1, last];
    return [1, '…', current, '…', last];
  });

  readonly kpi = computed(() => {
    const admins = this.store.admins();
    const total = admins.length;
    const active = admins.filter((person) => person.status === 'active').length;
    const protectedCount = admins.filter((person) => person.twoFactor === 'active').length;
    const percent = total ? (protectedCount / total) * 100 : 0;
    const percentLabel = `${percent.toFixed(1).replace('.', ',').replace(',0', '')}%`;
    return { total, active, protectedCount, percentLabel, sessions: 18, blockedIps: 7 };
  });

  roleLabel(code: string): string {
    return this.store.roles.find((role) => role.code === code)?.label ?? code;
  }

  statusLabel(person: AdminPerson): string {
    return person.status === 'active' ? 'Hoạt động' : person.status === 'locked' ? 'Tạm khóa' : 'Chưa xác minh';
  }

  setFilter(kind: 'role' | 'status' | 'twofa', value: string): void {
    if (value === MULTI_OPTION) return;
    this.updateColumnFilter(kind, value ? [value] : []);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.selectedIds.set([]);
    this.page.set(1);
  }

  resetFilters(): void {
    this.search.set('');
    this.columnFilters.name.set([]);
    this.columnFilters.role.set([]);
    this.columnFilters.twofa.set([]);
    this.columnFilters.login.set([]);
    this.columnFilters.status.set([]);
    this.columnSort.set(null);
    this.selectedIds.set([]);
    this.page.set(1);
  }

  filterFor(key: SecurityColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: SecurityColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.selectedIds.set([]);
    this.page.set(1);
  }

  sortFor(key: SecurityColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: SecurityColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(person: AdminPerson, column: SecurityColumn): string | number {
    switch (column) {
      case 'name': return person.name;
      case 'role': return this.roleLabel(person.role);
      case 'twofa': return person.twoFactor === 'active' ? 'Đã kích hoạt' : 'Chưa kích hoạt';
      case 'login': return loginTimestamp(person.lastLoginAt);
      case 'status': return this.statusLabel(person);
    }
  }

  private selectValue(values: string[]): string {
    return values.length === 1 ? values[0] : values.length > 1 ? MULTI_OPTION : '';
  }

  private multiOption(values: string[], noun: string): CustomSelectOption[] {
    return values.length > 1 ? [{ value: MULTI_OPTION, label: `${values.length} ${noun} đã chọn` }] : [];
  }

  toggleSelect(id: string, checked: boolean): void {
    if (!this.store.admins().some((person) => person.id === id && !person.isSelf)) return;
    this.selectedIds.update((ids) => checked ? [...ids, id] : ids.filter((value) => value !== id));
  }

  toggleSelectAll(): void {
    this.selectedIds.set(this.allSelected() ? [] : this.selectablePeople().map((person) => person.id));
  }

  openBulk(kind: AccountDialogKind): void {
    const allowed = kind === 'lock' ? this.canLockSelected() : kind === 'unlock' ? this.canUnlockSelected() : this.canResetSelected();
    if (allowed) this.bulkAction.set(kind);
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds.set(ids);
  }

  runSelectionAction(key: string, ids: readonly string[]): void {
    this.selectionListOpen.set(false);
    this.selectedIds.set([...ids]);
    this.openBulk(key as AccountDialogKind);
  }

  onBulkSaved(result: RoleDialogResult): void {
    this.bulkAction.set(null);
    this.selectedIds.set([]);
    this.toast.show(result.title, 'success', 4600, result.detail);
  }

  goToPage(item: number | string): void {
    if (typeof item === 'number') this.page.set(item);
  }

  toggleRowMenu(id: string, event: MouseEvent | KeyboardEvent): void {
    if (this.rowMenuId() === id) { this.closeRowMenu(); return; }
    if (!this.store.admins().some(person => person.id === id && !person.isSelf) || this.denied()) return;
    this.menuTrigger = event.currentTarget as HTMLElement;
    const rect = this.menuTrigger.getBoundingClientRect();
    const margin = 12, gap = 6;
    const width = Math.min(240, window.innerWidth - margin * 2);
    const height = Math.min(182, window.innerHeight - margin * 2);
    const below = window.innerHeight - rect.bottom - gap - margin;
    this.menuPosition.set({
      width,
      left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)),
      top: Math.max(margin, below >= height ? rect.bottom + gap : rect.top - gap - height)
    });
    this.rowMenuId.set(id);
    setTimeout(() => {
      if (this.rowMenuId() === id) document.querySelector<HTMLButtonElement>('#security-row-menu button')?.focus();
    });
  }

  openRowMenuFromKeyboard(event: Event, id: string): void {
    if (!(event instanceof KeyboardEvent)) return;
    event.preventDefault();
    if (this.rowMenuId() !== id) this.toggleRowMenu(id, event);
  }

  closeRowMenu(restoreFocus = true): void {
    if (!this.rowMenuId()) return;
    this.rowMenuId.set(null);
    this.menuPosition.set(null);
    if (restoreFocus) this.menuTrigger?.focus({ preventScroll: true });
  }

  onRowMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closeRowMenu(); return; }
    if (event.key === 'Tab') { this.closeRowMenu(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }

  @HostListener('window:resize')
  closeRowMenuOnResize(): void { this.closeRowMenu(); }

  @HostListener('document:scroll', ['$event'])
  closeRowMenuOnScroll(event: Event): void {
    if (event.target instanceof Element && event.target.closest('#security-row-menu')) return;
    this.closeRowMenu();
  }

  @HostListener('document:pointerdown', ['$event'])
  closeRowMenuOnOutside(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Element && !target.closest('.row-menu-anchor, #security-row-menu')) this.closeRowMenu(false);
  }

  @HostListener('document:keydown.escape')
  closeRowMenuOnEscape(): void {
    this.closeRowMenu();
  }

  openChange(person: AdminPerson): void {
    this.closeRowMenu();
    this.changeTarget.set(person);
  }

  openAccount(kind: AccountDialogKind, person: AdminPerson): void {
    this.closeRowMenu();
    this.accountAction.set({ kind, person });
  }

  openHistory(person: AdminPerson): void {
    this.closeRowMenu();
    this.historyPerson.set(person);
  }

  onSaved(result: RoleDialogResult): void {
    this.assignOpen.set(false);
    this.changeTarget.set(null);
    this.accountAction.set(null);
    this.toast.show(result.title, 'success', 4600, result.detail);
  }

  onDialogError(message: string): void {
    this.toast.show(message, 'error');
  }

  async export(format: ExportFormat): Promise<void> {
    const rows: (string | number)[][] = [
      ['Mã', 'Nhân sự', 'Email', 'Vai trò', '2FA', 'Đăng nhập gần nhất', 'Trạng thái'],
      ...this.filtered().map((person) => [
        person.code,
        person.name,
        person.email,
        this.roleLabel(person.role),
        person.twoFactor === 'active' ? 'Đã kích hoạt' : 'Chưa kích hoạt',
        person.lastLoginAt,
        this.statusLabel(person)
      ])
    ];
    await downloadTable(format, 'thinkup-phan-quyen-admin', rows);
    this.toast.show('Đã xuất danh sách phân quyền', 'success', 3200, `${this.filtered().length} tài khoản · dữ liệu demo`);
  }

  viewAuditLog(): void {
    void this.router.navigate(['/system/audit']);
  }

  backToDashboard(): void {
    void this.router.navigate(['/']);
  }
}

function loginDate(value: string): string {
  return value.split('·')[0].trim();
}

function loginTimestamp(value: string): number {
  const [datePart, timePart] = value.split('·').map((part) => part.trim());
  const [day, month, year] = datePart.split('/');
  if (!day || !month || !year) return 0;
  const parsed = Date.parse(`${year}-${month}-${day}T${timePart || '00:00'}`);
  return Number.isNaN(parsed) ? 0 : parsed;
}
