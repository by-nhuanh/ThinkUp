import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { UserRowMenuItem, UserRowMenuComponent } from '../components/user-row-menu/user-row-menu.component';
import { UserDateRangeComponent } from '../components/user-date-range/user-date-range.component';
import { UserModalComponent } from '../components/user-modal/user-modal.component';
import { UserToastComponent } from '../components/user-toast/user-toast.component';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONE } from '../models/user-management.labels';
import { DisciplineLevel, Student } from '../models/user-management.models';
import { UserManagementService } from '../services/user-management.service';
import { UserToastService } from '../services/user-toast.service';
import {
  formatCount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeadline,
  lockDeadlineIso
} from '../user-management.utils';

type StudentModal = 'profile' | 'lock' | 'unlock';

/** Nhãn + thời hạn của từng mức kỷ luật trong hộp thoại khoá tài khoản học viên. */
const LEVELS: ReadonlyArray<{ level: DisciplineLevel; title: string; tag: string; description: string; days: number | null }> = [
  {
    level: 1,
    title: 'Mức 1 · Cảnh cáo vi phạm nhẹ',
    tag: '7 ngày',
    description: 'Áp dụng cho spam bình luận, quấy rối thảo luận hoặc học viên gây mất trật tự phòng học ảo.',
    days: 7
  },
  {
    level: 2,
    title: 'Mức 2 · Đình chỉ có thời hạn',
    tag: '30 ngày',
    description: 'Áp dụng khi chia sẻ tài khoản cho nhiều người dùng chung hoặc gian lận làm bài kiểm tra.',
    days: 30
  },
  {
    level: 3,
    title: 'Mức 3 · Khóa vĩnh viễn',
    tag: 'Vô thời hạn',
    description: 'Áp dụng khi gian lận thanh toán, can thiệp mã nguồn/hack testcase phòng Lab hoặc phát tán mã độc.',
    days: null
  }
];

/**
 * Danh sách học viên — frame Figma "Quản lý học viên" (node 5541:17828).
 * Bảng có chọn nhiều dòng để khoá tài khoản hàng loạt.
 */
@Component({
  selector: 'app-students',
  standalone: true,
  imports: [
    SearchFieldComponent,
    CustomSelectComponent,
    ExportMenuComponent,
    UserDateRangeComponent,
    UserModalComponent,
    UserRowMenuComponent,
    UserToastComponent
  ],
  templateUrl: './students.component.html',
  styleUrls: ['../user-page.css', '../user-modal-content.css', './students.component.css']
})
export class StudentsComponent {
  private readonly data = inject(UserManagementService);
  private readonly toastService = inject(UserToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly students = this.data.students;
  readonly kpis = this.data.studentKpis;
  readonly statusLabels = STUDENT_STATUS_LABELS;
  readonly statusTone = STUDENT_STATUS_TONE;
  readonly levels = LEVELS;
  readonly pageSize = 7;
  readonly formatCount = formatCount;
  readonly formatCurrency = formatCurrency;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;

  readonly searchInput = signal('');
  readonly query = signal('');
  readonly status = signal('');
  readonly courseCount = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);

  readonly modal = signal<StudentModal | null>(null);
  readonly selected = signal<Student | null>(null);
  readonly selection = signal<ReadonlyArray<string>>([]);

  readonly level = signal<DisciplineLevel>(1);
  readonly reason = signal('');
  readonly evidence = signal<ReadonlyArray<string>>([]);
  readonly unlockReason = signal('');

  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'active', label: 'Đang hoạt động' },
    { value: 'locked', label: 'Đang bị khóa' },
    { value: 'inactive', label: 'Tạm ngưng' }
  ];

  readonly courseCountOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả số lượng' },
    { value: 'none', label: 'Chưa mua khóa học nào' },
    { value: '1-3', label: 'Đã mua 1 đến 3 khóa' },
    { value: 'more', label: 'Đã mua trên 3 khóa' }
  ];

  readonly activePercent = computed(() => {
    const kpi = this.kpis();
    return kpi.total ? Math.round((kpi.active / kpi.total) * 100) : 0;
  });

  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('vi-VN');
    const status = this.status();
    const courseCount = this.courseCount();
    const from = this.from();
    const to = this.to();

    return this.students().filter((item) => {
      const haystack = [item.id, item.name, item.email, item.phone].join(' ').toLocaleLowerCase('vi-VN');
      const courseOk = !courseCount
        || (courseCount === 'none' && item.courseCount === 0)
        || (courseCount === '1-3' && item.courseCount >= 1 && item.courseCount <= 3)
        || (courseCount === 'more' && item.courseCount > 3);
      return (!query || haystack.includes(query))
        && (!status || item.status === status)
        && courseOk
        && (!from || item.registeredAt >= from)
        && (!to || item.registeredAt <= to);
    });
  });

  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()));
  readonly visible = computed(() => {
    const page = this.currentPage();
    return this.filtered().slice((page - 1) * this.pageSize, page * this.pageSize);
  });
  readonly rangeStart = computed(() => (this.filtered().length ? (this.currentPage() - 1) * this.pageSize + 1 : 0));
  readonly rangeEnd = computed(() => Math.min(this.currentPage() * this.pageSize, this.filtered().length));

  readonly pageItems = computed<Array<number | 'gap'>>(() => {
    const total = this.pages();
    const current = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    if (current <= 3) return [1, 2, 3, 'gap', total];
    if (current >= total - 2) return [1, 'gap', total - 2, total - 1, total];
    return [1, 'gap', current, 'gap', total];
  });

  /** Toàn bộ dòng của trang hiện tại đã được chọn. */
  readonly allVisibleSelected = computed(() => {
    const visible = this.visible();
    return visible.length > 0 && visible.every((item) => this.selection().includes(item.id));
  });

  /** Chọn một phần dòng trên trang — dùng cho trạng thái indeterminate của checkbox tổng. */
  readonly someVisibleSelected = computed(() => {
    const visible = this.visible();
    return !this.allVisibleSelected() && visible.some((item) => this.selection().includes(item.id));
  });

  readonly lockTargets = computed(() => {
    const selected = this.selected();
    return selected ? [selected.id] : this.selection();
  });

  readonly lockSubjectLabel = computed(() => {
    const selected = this.selected();
    if (selected) return selected.name;
    const count = this.selection().length;
    return count > 1 ? `${count} học viên đã chọn` : '1 học viên đã chọn';
  });

  readonly levelDays = computed(() => LEVELS.find((item) => item.level === this.level())?.days ?? null);

  readonly canSubmitLock = computed(() => this.reason().trim().length >= 10 && this.evidence().length > 0);
  readonly canSubmitUnlock = computed(() => this.unlockReason().trim().length >= 10);

  private readonly baseMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'orders', label: 'Đơn hàng' },
    { key: 'lock', label: 'Xử lý kỷ luật', danger: true }
  ];

  private readonly lockedMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'orders', label: 'Đơn hàng' },
    { key: 'unlock', label: 'Mở khóa tài khoản' },
    { key: 'lock', label: 'Xử lý kỷ luật', danger: true }
  ];

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  menuItemsFor(student: Student): readonly UserRowMenuItem[] {
    return student.status === 'locked' ? this.lockedMenuItems : this.baseMenuItems;
  }

  onRowAction(key: string, student: Student): void {
    switch (key) {
      case 'profile':
        this.openProfile(student);
        break;
      case 'orders':
        this.openOrders(student);
        break;
      case 'lock':
        this.openLock(student);
        break;
      case 'unlock':
        this.openUnlock(student);
        break;
    }
  }

  setSearch(value: string): void {
    this.searchInput.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query.set(value);
      this.page.set(1);
    }, 250);
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
  }

  setCourseCount(value: string): void {
    this.courseCount.set(value);
    this.page.set(1);
  }

  setRange(range: { from: string; to: string }): void {
    this.from.set(range.from);
    this.to.set(range.to);
    this.page.set(1);
  }

  hasActiveFilters(): boolean {
    return !!(this.query() || this.status() || this.courseCount() || this.from() || this.to());
  }

  resetFilters(): void {
    clearTimeout(this.searchTimer);
    this.searchInput.set('');
    this.query.set('');
    this.status.set('');
    this.courseCount.set('');
    this.from.set('');
    this.to.set('');
    this.page.set(1);
  }

  pageTo(value: number): void {
    this.page.set(Math.max(1, Math.min(this.pages(), value)));
  }

  isSelected(id: string): boolean {
    return this.selection().includes(id);
  }

  toggleRow(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selection.update((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  toggleAllVisible(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ids = this.visible().map((item) => item.id);
    this.selection.update((current) => (checked
      ? Array.from(new Set([...current, ...ids]))
      : current.filter((id) => !ids.includes(id))));
  }

  clearSelection(): void {
    this.selection.set([]);
  }

  openProfile(student: Student): void {
    this.selected.set(student);
    this.modal.set('profile');
  }

  /** Mở trang Đơn hàng đã lọc sẵn theo email học viên. */
  openOrders(student: Student): void {
    void this.router.navigate(['/business/orders'], { queryParams: { q: student.email } });
  }

  openLock(student: Student): void {
    this.selected.set(student);
    this.level.set(1);
    this.reason.set('');
    this.evidence.set([]);
    this.modal.set('lock');
  }

  openBulkLock(): void {
    this.selected.set(null);
    this.level.set(1);
    this.reason.set('');
    this.evidence.set([]);
    this.modal.set('lock');
  }

  openUnlock(student: Student): void {
    this.selected.set(student);
    this.unlockReason.set('');
    this.modal.set('unlock');
  }

  closeModal(): void {
    this.modal.set(null);
    this.selected.set(null);
  }

  setLevel(level: DisciplineLevel): void {
    this.level.set(level);
  }

  /** Hạn khoá tương ứng từng mức, dùng chung cho thẻ chọn mức và banner nhắc. */
  deadlineLabel(days: number | null): string {
    const deadline = lockDeadlineIso(days);
    return deadline
      ? `Tài khoản sẽ bị khóa tới ${formatDeadline(deadline)}.`
      : 'Tài khoản sẽ bị khóa vĩnh viễn.';
  }

  /** Hạn khoá đang lưu trên hồ sơ học viên. */
  lockExpiryLabel(student: Student): string {
    return student.lockedUntil
      ? `Hết hạn: ${formatDeadline(student.lockedUntil)}`
      : 'Khóa vĩnh viễn, không có ngày hết hạn.';
  }

  setReasonFromEvent(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  setUnlockReasonFromEvent(event: Event): void {
    this.unlockReason.set((event.target as HTMLTextAreaElement).value);
  }

  onEvidenceChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const names = Array.from(input.files ?? []).map((file) => file.name).slice(0, 5);
    this.evidence.set(names);
    this.notify(names.length ? `Đã chọn ${names.length} tệp bằng chứng.` : 'Chưa chọn tệp bằng chứng.');
  }

  submitLock(): void {
    if (!this.canSubmitLock()) return;
    const targets = this.lockTargets();
    if (!targets.length) return;
    this.data.lockStudents({
      ids: targets,
      level: this.level(),
      reason: this.reason().trim(),
      evidence: this.evidence()
    });
    this.selection.set([]);
    this.modal.set(null);
    this.selected.set(null);
    this.notify(`Đã khóa ${targets.length} tài khoản học viên.`);
  }

  submitUnlock(): void {
    const student = this.selected();
    if (!student || !this.canSubmitUnlock()) return;
    this.data.unlockStudent(student.id);
    this.modal.set(null);
    this.selected.set(null);
    this.notify(`Đã mở khoá tài khoản ${student.name}.`);
  }

  exportList(format: ExportFormat): void {
    const rows: Array<Array<string | number>> = [
      ['Mã học viên', 'Họ tên', 'Email', 'Số điện thoại', 'Số khóa học', 'Ngày đăng ký', 'Trạng thái'],
      ...this.filtered().map((item) => [
        item.id,
        item.name,
        item.email,
        item.phone,
        item.courseCount,
        formatDate(item.registeredAt),
        STUDENT_STATUS_LABELS[item.status]
      ])
    ];
    void downloadTable(format, 'thinkup-hoc-vien', rows);
    this.notify(`Đang xuất ${this.filtered().length} học viên.`);
  }

  notify(message: string): void {
    this.toastService.show(message);
  }
}
