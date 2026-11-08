import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { AdminHistoryEntry, AdminPerson } from '../models/system.models';
import { SYSTEM_STORE } from '../data/system.store';
import { SystemToastService } from '../services/system-toast.service';
import { SystemToastComponent } from '../components/system-toast/system-toast.component';
import { RoleDialogComponent, RoleDialogResult } from '../components/role-dialog/role-dialog.component';
import { AccountDialogComponent, AccountDialogKind } from '../components/account-dialog/account-dialog.component';
import { HistoryDialogComponent } from '../components/history-dialog/history-dialog.component';
import { HistoryDetailDialogComponent } from '../components/history-detail-dialog/history-detail-dialog.component';

const INITIALS_OVERRIDES: Record<string, string> = {
  'Lê Hoàng Nam': 'LH',
  'Phạm Mai Linh': 'ML',
  'Đỗ Quốc Tuấn': 'QT'
};

@Component({
  selector: 'app-system-security',
  standalone: true,
  imports: [
    RouterLink,
    CustomSelectComponent,
    SearchFieldComponent,
    ExportMenuComponent,
    SystemToastComponent,
    RoleDialogComponent,
    AccountDialogComponent,
    HistoryDialogComponent,
    HistoryDetailDialogComponent
  ],
  templateUrl: './security.component.html',
  styleUrls: ['../system-page.css', './security.component.css']
})
export class SecurityComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(SYSTEM_STORE);
  private readonly toast = inject(SystemToastService);

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly denied = computed(() => this.queryParams()?.get('denied') === '1');

  readonly search = signal('');
  readonly roleFilter = signal('all');
  readonly statusFilter = signal('all');
  readonly twofaFilter = signal('all');
  readonly page = signal(1);
  readonly rowMenuId = signal<string | null>(null);

  readonly assignOpen = signal(false);
  readonly accountAction = signal<{ kind: AccountDialogKind; person: AdminPerson } | null>(null);
  readonly changeTarget = signal<AdminPerson | null>(null);
  readonly historyPerson = signal<AdminPerson | null>(null);
  readonly historyDetail = signal<AdminHistoryEntry | null>(null);

  readonly roleOptions = [
    { value: 'all', label: 'Tất cả vai trò' },
    ...this.store.roles.map((role) => ({ value: role.code, label: role.label.split(' (')[0] }))
  ];
  readonly statusOptions = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'active', label: 'Hoạt động' },
    { value: 'locked', label: 'Tạm khóa' },
    { value: 'unverified', label: 'Chưa xác minh' }
  ];
  readonly twofaOptions = [
    { value: 'all', label: 'Tất cả 2FA' },
    { value: 'active', label: 'Đã kích hoạt' },
    { value: 'inactive', label: 'Chưa kích hoạt' }
  ];

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.store.admins().filter((person) => {
      if (query && !`${person.name} ${person.email} ${person.code}`.toLowerCase().includes(query)) return false;
      if (this.roleFilter() !== 'all' && person.role !== this.roleFilter()) return false;
      if (this.statusFilter() !== 'all' && person.status !== this.statusFilter()) return false;
      if (this.twofaFilter() !== 'all' && person.twoFactor !== this.twofaFilter()) return false;
      return true;
    });
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

  initials(name: string): string {
    if (INITIALS_OVERRIDES[name]) return INITIALS_OVERRIDES[name];
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toUpperCase();
  }

  avatarClass(role: string): string {
    return role === 'SA' ? 'violet' : role === 'FA' ? 'green' : role === 'CS' ? 'amber' : '';
  }

  statusLabel(person: AdminPerson): string {
    return person.status === 'active' ? 'Hoạt động' : person.status === 'locked' ? 'Tạm khóa' : 'Chưa xác minh';
  }

  setFilter(kind: 'role' | 'status' | 'twofa', value: string): void {
    if (kind === 'role') this.roleFilter.set(value);
    if (kind === 'status') this.statusFilter.set(value);
    if (kind === 'twofa') this.twofaFilter.set(value);
    this.page.set(1);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  resetFilters(): void {
    this.search.set('');
    this.roleFilter.set('all');
    this.statusFilter.set('all');
    this.twofaFilter.set('all');
    this.page.set(1);
  }

  goToPage(item: number | string): void {
    if (typeof item === 'number') this.page.set(item);
  }

  toggleRowMenu(id: string): void {
    this.rowMenuId.update((current) => current === id ? null : id);
  }

  @HostListener('document:pointerdown', ['$event'])
  closeRowMenuOnOutside(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Element && !target.closest('.row-menu-anchor')) this.rowMenuId.set(null);
  }

  @HostListener('document:keydown.escape')
  closeRowMenuOnEscape(): void {
    this.rowMenuId.set(null);
  }

  openChange(person: AdminPerson): void {
    this.rowMenuId.set(null);
    this.changeTarget.set(person);
  }

  openAccount(kind: AccountDialogKind, person: AdminPerson): void {
    this.rowMenuId.set(null);
    this.accountAction.set({ kind, person });
  }

  openHistory(person: AdminPerson): void {
    this.rowMenuId.set(null);
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