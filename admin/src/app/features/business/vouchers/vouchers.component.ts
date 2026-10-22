import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessVoucher, VoucherAdvancedFilter, VoucherAudience, VoucherStatus, VoucherWeeklyDay, countVoucherFilter, emptyVoucherFilter } from '../models/business.models';
import { BusinessDemoService } from '../services/business-demo.service';
import { copyText, money, paginationItems, voucherFundedAmount, voucherMaxDiscountPerUse, voucherSpentAmount } from '../business-utils';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';

type VoucherSort = 'created-desc' | 'created-asc' | 'starts-desc' | 'starts-asc' | 'ends-asc' | 'ends-desc';

@Component({ selector: 'app-vouchers', standalone: true, imports: [FormsModule, DateTimePickerComponent, CustomSelectComponent, ExportMenuComponent, SearchFieldComponent], templateUrl: './vouchers.component.html', styleUrl: './vouchers.component.css' })
export class VouchersComponent {
  private readonly data = inject(BusinessDemoService);
  private backdropPointerStarted = false;
  readonly money = money;
  readonly voucherMaxDiscountPerUse = voucherMaxDiscountPerUse;
  readonly voucherSpentAmount = voucherSpentAmount;
  readonly vouchers = this.data.vouchers;
  readonly search = signal('');
  readonly sponsor = signal('');
  readonly status = signal<VoucherStatus | 'hidden' | ''>('');
  readonly sort = signal<VoucherSort>('created-desc');
  readonly sponsorOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'thinkup', label: 'ThinkUp' },
    { value: 'instructor', label: 'Giảng viên' }
  ];
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'active', label: 'Đang phát hành' },
    { value: 'scheduled', label: 'Chưa bắt đầu' },
    { value: 'locked', label: 'Tạm khóa' },
    { value: 'expired', label: 'Đã hết hạn' }
  ];
  readonly sortOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'created-desc', label: 'Ngày tạo: Mới → cũ' },
    { value: 'created-asc', label: 'Ngày tạo: Cũ → mới' },
    { value: 'starts-desc', label: 'Ngày bắt đầu: Mới → cũ' },
    { value: 'starts-asc', label: 'Ngày bắt đầu: Cũ → mới' },
    { value: 'ends-asc', label: 'Ngày kết thúc: Sớm → muộn' },
    { value: 'ends-desc', label: 'Ngày kết thúc: Muộn → sớm' }
  ];
  readonly formSponsorOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'thinkup', label: 'ThinkUp tài trợ' },
    { value: 'instructor', label: 'Giảng viên tài trợ' }
  ];
  readonly formScopeOptions = computed<ReadonlyArray<CustomSelectOption>>(() => {
    const item = this.form();
    const instructorSponsor = item?.sponsor === 'instructor';
    if (instructorSponsor) {
      return [
        { value: 'instructor', label: 'Tất cả khóa học của giảng viên' },
        { value: 'courses', label: 'Một số khóa học của giảng viên' }
      ];
    }
    return [
      { value: 'all', label: 'Toàn sàn' },
      { value: 'rating', label: 'Khóa học theo số sao' },
      { value: 'instructor', label: 'Theo giảng viên' },
      { value: 'courses', label: 'Theo khóa học' }
    ];
  });
  readonly formDiscountTypeOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'fixed', label: 'Số tiền cố định' },
    { value: 'percent', label: 'Tỷ lệ phần trăm' }
  ];
  readonly audienceOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'all', label: 'Tất cả học viên' },
    { value: 'new_learner', label: 'Học viên mới (chưa từng mua khóa học)' }
  ];
  readonly filterSponsorOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'thinkup', label: 'ThinkUp tài trợ' },
    { value: 'instructor', label: 'Giảng viên tài trợ' }
  ];
  readonly filterScopeOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'all', label: 'Toàn sàn' },
    { value: 'rating', label: 'Theo số sao' },
    { value: 'instructor', label: 'Theo giảng viên' },
    { value: 'courses', label: 'Theo khóa học' }
  ];
  readonly filterDiscountTypeOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'fixed', label: 'Số tiền cố định' },
    { value: 'percent', label: 'Tỷ lệ phần trăm' }
  ];
  readonly filterStatusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'active', label: 'Đang phát hành' },
    { value: 'scheduled', label: 'Chưa bắt đầu' },
    { value: 'locked', label: 'Tạm khóa' },
    { value: 'expired', label: 'Đã hết hạn' }
  ];
  readonly selectedCodes = signal<string[]>([]);
  /** Số voucher đang được chọn. */
  readonly selectedCount = computed(() => this.selectedCodes().length);
  /** Các voucher đang được chọn. */
  readonly selectedItems = computed(() => this.vouchers().filter(item => this.selectedCodes().includes(item.code)));
  /** Đã chọn hết voucher trong danh sách đang lọc hay chưa. */
  readonly allSelected = computed(() => {
    const items = this.filtered();
    return items.length > 0 && items.every(item => this.selectedCodes().includes(item.code));
  });
  /** Đã chọn một phần (ô tick ở tiêu đề hiện trạng thái nửa chọn). */
  readonly someSelected = computed(() => this.selectedCount() > 0 && !this.allSelected());
  /** Voucher đã chọn có thể tạm khóa không. */
  readonly canLockSelected = computed(() => this.selectedItems().some(item => ['active', 'scheduled'].includes(this.statusOf(item))));
  /** Voucher đã chọn có thể mở khóa không. */
  readonly canUnlockSelected = computed(() => this.selectedItems().some(item => item.locked && this.statusOf(item) !== 'expired'));
  readonly page = signal(1);

  readonly pageSize = 8;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pagination = computed(() => paginationItems(this.page(), this.pages()));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly openActionMenuCode = signal<string | null>(null);
  readonly detail = signal<BusinessVoucher | null>(null);
  readonly editing = signal(false);
  readonly form = signal<BusinessVoucher | null>(null);
  readonly confirm = signal<{ items: BusinessVoucher[]; locked: boolean } | null>(null);
  readonly editOriginal = signal<BusinessVoucher | null>(null);
  readonly error = signal('');
  readonly toast = signal('');
  readonly filtered = computed(() => {
    const items = this.vouchers().filter(item => {
      if (item.deleted) return false;
      const query = this.search().trim().toLocaleUpperCase('vi-VN');
      return (!query || item.code.toLocaleUpperCase('vi-VN').includes(query))
        && (!this.sponsor() || item.sponsor === this.sponsor())
        && this.matchesStatus(item, this.status())
        && this.matchesAdvanced(item);
    });
    return [...items].sort((left, right) => this.compareVouchers(left, right, this.sort()));
  });
  readonly active = computed(() => this.vouchers().filter(item => !item.deleted && this.statusOf(item) === 'active').length);
  readonly hidden = computed(() => this.vouchers().filter(item => !item.deleted && ['scheduled', 'locked'].includes(this.statusOf(item))).length);
  readonly expired = computed(() => this.vouchers().filter(item => !item.deleted && this.statusOf(item) === 'expired').length);
  readonly funded = computed(() => this.vouchers().filter(item => !item.deleted).reduce((sum, item) => sum + item.fundedAmount, 0));
  readonly thinkupFunded = computed(() => this.vouchers().filter(item => !item.deleted && item.sponsor === 'thinkup').reduce((sum, item) => sum + item.fundedAmount, 0));
  readonly instructorFunded = computed(() => this.vouchers().filter(item => !item.deleted && item.sponsor === 'instructor').reduce((sum, item) => sum + item.fundedAmount, 0));
  readonly activeThinkup = computed(() => this.vouchers().filter(item => !item.deleted && item.sponsor === 'thinkup' && this.statusOf(item) === 'active').length);
  readonly activeInstructor = computed(() => this.active() - this.activeThinkup());
  readonly advancedOpen = signal(false);
  readonly advancedFilter = signal<VoucherAdvancedFilter>(emptyVoucherFilter());
  readonly filterDraft = signal<VoucherAdvancedFilter>(emptyVoucherFilter());
  readonly advancedFilterCount = computed(() => countVoucherFilter(this.advancedFilter()));
  readonly deleting = signal<BusinessVoucher | null>(null);
  toggleRowActions(code: string): void {
    this.openActionMenuCode.update(current => current === code ? null : code);
  }
  closeRowActions(): void { this.openActionMenuCode.set(null); }

  recordBackdropPointerDown(event: PointerEvent): void {
    this.backdropPointerStarted = event.target === event.currentTarget;
  }

  closeFromBackdrop(event: MouseEvent, dialog: 'form' | 'detail' | 'filter' | 'confirm' | 'delete'): void {
    const shouldClose = this.backdropPointerStarted && event.target === event.currentTarget;
    this.backdropPointerStarted = false;
    if (!shouldClose) return;

    switch (dialog) {
      case 'form': this.form.set(null); break;
      case 'detail': this.detail.set(null); break;
      case 'filter': this.closeAdvancedFilter(); break;
      case 'confirm': this.confirm.set(null); break;
      case 'delete': this.closeDelete(); break;
    }
  }

  /** Ngân sách chiết khấu tối đa mà voucher đang cấu hình cam kết với ThinkUp. */
  readonly formFundedAmount = computed(() => {
    const item = this.form();
    return item ? voucherFundedAmount(item) : 0;
  });
  /** Chiết khấu đã chi tiêu theo số lượt voucher đã dùng. */
  readonly formSpentAmount = computed(() => {
    const item = this.form();
    return item ? voucherSpentAmount(item) : 0;
  });
  /** Mức giảm tối đa áp dụng cho một lượt dùng, dùng để tính ngân sách. */
  readonly formMaxDiscountPerUse = computed(() => {
    const item = this.form();
    return item ? voucherMaxDiscountPerUse(item) : 0;
  });

  statusOf(item: BusinessVoucher): VoucherStatus {
    if (item.endsAt <= this.localNow() || item.used >= item.limit) return 'expired';
    if (item.locked) return 'locked';
    if (item.startsAt > this.localNow()) return 'scheduled';
    return 'active';
  }
  matchesStatus(item: BusinessVoucher, status: VoucherStatus | 'hidden' | ''): boolean {
    if (!status) return true;
    if (status === 'hidden') return ['scheduled', 'locked'].includes(this.statusOf(item));
    if (status === 'expired') return this.statusOf(item) === 'expired';
    return this.statusOf(item) === status;
  }
  private inRange(value: number, min: number | null, max: number | null): boolean {
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    return true;
  }
  private inDateRange(value: string, from: string, to: string): boolean {
    const day = value.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }
  private matchesAdvanced(item: BusinessVoucher): boolean {
    const filter = this.advancedFilter();
    const code = filter.code.trim().toLocaleUpperCase('vi-VN');
    if (code && !item.code.toLocaleUpperCase('vi-VN').includes(code)) return false;
    if (filter.sponsor && item.sponsor !== filter.sponsor) return false;
    if (filter.scope && item.scope !== filter.scope) return false;
    if (filter.discountType && item.discountType !== filter.discountType) return false;
    if (!this.inRange(item.discountValue, filter.discountMin, filter.discountMax)) return false;
    if (!this.inRange(item.minOrder, filter.minOrderMin, filter.minOrderMax)) return false;
    if (!this.inRange(item.used, filter.usedMin, filter.usedMax)) return false;
    if (!this.inRange(item.limit - item.used, filter.remainingMin, filter.remainingMax)) return false;
    if (!this.inDateRange(item.startsAt, filter.startsFrom, filter.startsTo)) return false;
    if (!this.inDateRange(item.endsAt, filter.endsFrom, filter.endsTo)) return false;
    return this.matchesStatus(item, filter.status);
  }
  openAdvancedFilter(): void {
    this.filterDraft.set({ ...this.advancedFilter() });
    this.advancedOpen.set(true);
  }
  closeAdvancedFilter(): void { this.advancedOpen.set(false); }
  applyAdvancedFilter(): void {
    this.advancedFilter.set({ ...this.filterDraft() });
    this.advancedOpen.set(false);
    this.selectedCodes.set([]);
    this.page.set(1);
  }
  clearAdvancedFilter(): void {
    this.filterDraft.set(emptyVoucherFilter());
    this.advancedFilter.set(emptyVoucherFilter());
    this.advancedOpen.set(false);
    this.selectedCodes.set([]);
    this.page.set(1);
  }
  patchFilter<K extends keyof VoucherAdvancedFilter>(key: K, value: VoucherAdvancedFilter[K]): void {
    this.filterDraft.update(filter => ({ ...filter, [key]: value }));
  }
  statusLabel(value: VoucherStatus): string { return { active: 'Đang phát hành', scheduled: 'Chưa bắt đầu', locked: 'Tạm khóa', expired: 'Đã hết hạn' }[value]; }
  /** Status of the stored voucher, shown read-only in the edit dialog. */
  readonly editedStatus = computed<VoucherStatus | null>(() => {
    const original = this.editOriginal();
    return original ? this.statusOf(original) : null;
  });
  /** Short explanation of the current status, rendered next to the badge. */
  statusHint(value: VoucherStatus): string {
    const original = this.editOriginal();
    if (!original) return '';
    if (value === 'active') return `Còn ${Math.max(0, original.limit - original.used)} lượt · đã dùng ${original.used}/${original.limit}`;
    if (value === 'locked') return 'Đang tạm khóa, không nhận giao dịch mới';
    if (value === 'scheduled') return `Bắt đầu ${this.date(original.startsAt)}`;
    return 'Đã hết hạn theo thời gian hoặc hết lượt phát hành';
  }
  websiteVisibilityHint(item: BusinessVoucher): string {
    return item.showOnSite
      ? 'Bất kỳ khách hàng nào cũng có thể thấy và sử dụng voucher này.'
      : 'Chỉ những khách hàng có mã voucher trực tiếp mới có thể áp dụng.';
  }
  discount(item: BusinessVoucher): string { return item.discountType === 'fixed' ? money(item.discountValue) : `${item.discountValue}% · tối đa ${money(item.maxDiscount ?? 0)}`; }
  date(value: string): string { return value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4); }
  time(value: string): string {
    const time = value.slice(11, 19);
    return time.length === 5 ? `${time}:00` : time;
  }
  dateTime(value: string): string {
    return `${this.date(value)}, ${this.time(value)}`;
  }
  scopeLabel(item: BusinessVoucher): string {
    if (item.sponsor === 'instructor') {
      return item.scope === 'instructor' ? 'Tất cả khóa học của giảng viên' : 'Một số khóa học của giảng viên';
    }
    return { all: 'Toàn sàn', rating: 'Khóa học theo số sao', instructor: 'Theo giảng viên', courses: 'Theo khóa học' }[item.scope];
  }
  remaining(item: BusinessVoucher): number { return Math.max(0, item.limit - item.used); }
  localNow(): string {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  setSearch(value: string): void { this.search.set(value.trimStart().toLocaleUpperCase('vi-VN')); this.selectedCodes.set([]); this.page.set(1); }
  setSponsor(value: string): void { this.sponsor.set(value); this.selectedCodes.set([]); this.page.set(1); }
  setStatus(value: VoucherStatus | 'hidden' | ''): void { this.status.set(value); this.selectedCodes.set([]); this.page.set(1); }
  setSort(value: string): void {
    if (!this.sortOptions.some(option => option.value === value)) return;
    this.sort.set(value as VoucherSort);
    this.page.set(1);
  }

  private compareVouchers(left: BusinessVoucher, right: BusinessVoucher, sort: VoucherSort): number {
    const [leftValue, rightValue, direction] = sort.startsWith('created')
      ? [this.createdAtOf(left), this.createdAtOf(right), sort === 'created-desc' ? -1 : 1]
      : sort.startsWith('starts')
        ? [left.startsAt, right.startsAt, sort === 'starts-desc' ? -1 : 1]
        : [left.endsAt, right.endsAt, sort === 'ends-desc' ? -1 : 1];
    const difference = this.timestamp(leftValue) - this.timestamp(rightValue);
    return difference === 0 ? left.code.localeCompare(right.code, 'vi-VN') : difference * direction;
  }

  private createdAtOf(item: BusinessVoucher): string {
    return item.auditLog.find(entry => entry.action === 'created')?.at ?? item.startsAt;
  }

  private timestamp(value: string): number {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  async copyCode(code: string): Promise<void> {
    if (await copyText(code)) this.toast.set(`Đã sao chép mã ${code}.`);
    else this.toast.set('Không thể sao chép mã. Vui lòng thử lại.');
  }
  toggle(code: string, checked: boolean): void { this.selectedCodes.update(items => checked ? [...items, code] : items.filter(value => value !== code)); }
  /**
   * Nút −/✓ của thanh thao tác: tick hết toàn bộ voucher, bấm lần nữa thì bỏ tick hết.
   * Ô tick ở tiêu đề bảng dùng chung hàm này nên hai nơi luôn nhất quán.
   */
  toggleSelectAll(): void { this.selectedCodes.set(this.allSelected() ? [] : this.filtered().map(item => item.code)); }
  /** Tạm khóa hoặc mở khóa hàng loạt các voucher đang chọn. */
  requestBulkLock(locked: boolean): void {
    const eligible = this.selectedItems().filter(item => locked
      ? ['active', 'scheduled'].includes(this.statusOf(item))
      : item.locked && this.statusOf(item) !== 'expired');
    if (eligible.length) this.confirm.set({ items: eligible, locked });
  }
  openNew(): void {
    this.editing.set(false); this.error.set('');
    this.editOriginal.set(null);
    this.form.set({
      code: '', description: '', sponsor: 'thinkup', scope: 'all', audience: 'all',
      discountType: 'fixed', discountValue: 0, minOrder: 0, minCourseCount: 1,
      used: 0, limit: 1, perAccount: 1, startsAt: '', endsAt: '', weeklyLimitEnabled: false, weeklySchedule: this.defaultWeeklySchedule(),
      showOnSite: true, locked: false, fundedAmount: 0, auditLog: []
    });
  }
  openEdit(item: BusinessVoucher): void {
    if (this.statusOf(item) === 'expired') return;
    this.detail.set(null);
    this.editing.set(true);
    this.error.set('');
    this.editOriginal.set(structuredClone(item));
    this.form.set({ ...structuredClone(item), weeklySchedule: item.weeklySchedule?.length ? structuredClone(item.weeklySchedule) : this.defaultWeeklySchedule() });
  }
  backToVoucherDetail(): void {
    const original = this.editOriginal();
    if (!original) return;
    const current = this.vouchers().find(item => item.code === original.code) ?? original;
    this.form.set(null);
    this.editOriginal.set(null);
    this.editing.set(false);
    this.error.set('');
    this.detail.set(current);
  }
  get restrictedEdit(): boolean {
    const original = this.editOriginal();
    return !!original && ['active', 'locked'].includes(this.statusOf(original));
  }
  canChangeField(field: 'description' | 'limit' | 'endsAt'): boolean {
    if (!this.editing()) return true;
    const original = this.editOriginal();
    if (!original) return false;
    const originalStatus = this.statusOf(original);
    return originalStatus === 'scheduled'
      || (['active', 'locked'].includes(originalStatus) && ['description', 'limit', 'endsAt'].includes(field));
  }
  updateLimit(value: number): void {
    const original = this.editOriginal();
    if (this.restrictedEdit && original && value < original.limit) return;
    this.patch('limit', value);
  }
  setDiscountType(value: 'fixed' | 'percent'): void {
    if (this.editing() && this.restrictedEdit) return;
    this.form.update(item => item ? {
      ...item,
      discountType: value,
      discountValue: 0,
      maxDiscount: value === 'percent' ? 0 : undefined
    } : item);
  }
  updateMoneyField(field: 'discountValue' | 'maxDiscount' | 'minOrder', input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const value = digits ? Number(digits) : 0;
    const normalizedValue = Number.isFinite(value) ? value : 0;
    input.value = digits ? this.formatNumberInput(normalizedValue) : '';
    this.patch(field, normalizedValue);
  }
  formatNumberInput(value: number | undefined): string {
    return value ? new Intl.NumberFormat('vi-VN').format(value) : '';
  }
  patch<K extends keyof BusinessVoucher>(key: K, value: BusinessVoucher[K]): void { this.form.update(item => item ? { ...item, [key]: value } : item); }
  toggleWeeklyLimit(enabled: boolean): void { this.patch('weeklyLimitEnabled', enabled); }
  toggleWeeklyDay(day: number, enabled: boolean): void { this.updateWeeklyDay(day, value => ({ ...value, enabled })); }
  setWeeklyDayMode(day: number, allDay: boolean): void {
    this.updateWeeklyDay(day, value => ({ ...value, allDay, slots: allDay ? [] : (value.slots.length ? value.slots : [{ start: '09:00', end: '17:00' }]) }));
  }
  addWeeklySlot(day: number): void { this.updateWeeklyDay(day, value => ({ ...value, allDay: false, slots: [...value.slots, { start: '09:00', end: '17:00' }] })); }
  removeWeeklySlot(day: number, index: number): void { this.updateWeeklyDay(day, value => ({ ...value, slots: value.slots.filter((_, slotIndex) => slotIndex !== index) })); }
  updateWeeklySlot(day: number, index: number, field: 'start' | 'end', value: string): void {
    this.updateWeeklyDay(day, entry => ({ ...entry, slots: entry.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, [field]: value } : slot) }));
  }
  weeklyScheduleSummary(item: BusinessVoucher): string {
    if (!item.weeklyLimitEnabled) return 'Áp dụng tất cả ngày và giờ trong thời gian hiệu lực';
    const days = (item.weeklySchedule ?? []).filter(day => day.enabled);
    if (!days.length) return 'Chưa chọn ngày áp dụng';
    return days.map(day => `${day.label}: ${day.allDay ? 'Cả ngày' : day.slots.map(slot => `${slot.start}–${slot.end}`).join(', ')}`).join('; ');
  }
  private defaultWeeklySchedule(): VoucherWeeklyDay[] {
    return ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].map((label, day) => ({ day, label, enabled: false, allDay: true, slots: [] }));
  }
  private updateWeeklyDay(day: number, updater: (value: VoucherWeeklyDay) => VoucherWeeklyDay): void {
    this.form.update(item => item ? { ...item, weeklySchedule: (item.weeklySchedule ?? this.defaultWeeklySchedule()).map(value => value.day === day ? updater(value) : value) } : item);
  }
  changeSponsor(value: 'thinkup' | 'instructor'): void {
    this.form.update(item => item ? { ...item, sponsor: value, scope: value === 'instructor' ? 'instructor' : 'all', scopeTarget: '', instructor: '' } : item);
  }
  changeScope(value: BusinessVoucher['scope']): void {
    this.form.update(item => item ? { ...item, scope: value, scopeTarget: '' } : item);
  }
  save(): void {
    const value = this.form(); if (!value) return;
    const normalized = { ...value, code: value.code.trim().toUpperCase() };
    const original = this.editOriginal();
    if (this.editing() && original && !['scheduled', 'active', 'locked'].includes(this.statusOf(original))) {
      this.error.set('Voucher đã hết hạn nên không thể chỉnh sửa.');
      return;
    }
    if (this.editing() && original && this.restrictedEdit) {
      // Gia hạn là hai thay đổi độc lập: nới số lượt phát hành hoặc kéo dài thời hạn.
      if (normalized.limit < original.limit) { this.error.set(`Tổng lượt phát hành không được thấp hơn mức hiện tại (${original.limit}).`); return; }
      if (normalized.endsAt < original.endsAt) { this.error.set('Ngày kết thúc không được sớm hơn ngày kết thúc hiện tại.'); return; }
      normalized.sponsor = original.sponsor;
      normalized.instructor = original.instructor;
      normalized.scope = original.scope;
      normalized.scopeTarget = original.scopeTarget;
      normalized.audience = original.audience;
      normalized.discountType = original.discountType;
      normalized.discountValue = original.discountValue;
      normalized.maxDiscount = original.maxDiscount;
      normalized.minOrder = original.minOrder;
      normalized.minCourseCount = original.minCourseCount;
      normalized.perAccount = original.perAccount;
      normalized.startsAt = original.startsAt;
      normalized.locked = original.locked;
      normalized.used = original.used;
    }
    const duplicate = this.vouchers().some(item => item.code === normalized.code && (!this.editing() || item.code !== value.code));
    if (!/^[A-Z0-9-]+$/.test(normalized.code) || duplicate) { this.error.set('Mã voucher phải viết hoa, không dấu, không khoảng trắng và không trùng mã đã có.'); return; }
    if (normalized.discountValue <= 0 || (normalized.discountType === 'percent' && (normalized.discountValue > 100 || !normalized.maxDiscount || normalized.maxDiscount <= 0)) || normalized.minOrder <= 0 || normalized.minCourseCount < 1 || normalized.limit < 1 || normalized.perAccount < 1) { this.error.set('Điền mức giảm và các giới hạn hợp lệ. Giá trị tiền phải lớn hơn 0.'); return; }
    if (normalized.sponsor === 'instructor' && !normalized.instructor?.trim()) { this.error.set('Chọn giảng viên tài trợ trước khi thiết lập phạm vi áp dụng.'); return; }
    if (normalized.sponsor === 'instructor' && !['instructor', 'courses'].includes(normalized.scope)) { this.error.set('Phạm vi phải thuộc các khóa học của giảng viên tài trợ.'); return; }
    if (normalized.sponsor === 'instructor' && normalized.scope === 'courses' && !normalized.scopeTarget?.trim()) { this.error.set('Chỉ định ít nhất một khóa học thuộc giảng viên tài trợ.'); return; }
    if (normalized.scope === 'rating' && (!normalized.scopeTarget || Number(normalized.scopeTarget) < 1 || Number(normalized.scopeTarget) > 5)) { this.error.set('Nhập số sao từ 1 đến 5.'); return; }
    if (normalized.sponsor === 'thinkup' && ['instructor', 'courses'].includes(normalized.scope) && !normalized.scopeTarget?.trim()) { this.error.set('Chỉ định đối tượng áp dụng.'); return; }
    if (!normalized.startsAt || !normalized.endsAt || normalized.endsAt <= normalized.startsAt) { this.error.set('Thời gian kết thúc phải sau thời gian bắt đầu.'); return; }
    if (normalized.weeklyLimitEnabled) {
      const selectedDays = (normalized.weeklySchedule ?? []).filter(day => day.enabled);
      if (!selectedDays.length) { this.error.set('Chọn ít nhất một ngày áp dụng trong tuần.'); return; }
      const validTime = (value: string): boolean => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (selectedDays.some(day => !day.allDay && (!day.slots.length || day.slots.some(slot => !validTime(slot.start) || !validTime(slot.end) || slot.end <= slot.start)))) { this.error.set('Nhập giờ theo định dạng HH:mm và đảm bảo giờ kết thúc sau giờ bắt đầu.'); return; }
    }
    if (this.editing() && normalized.limit < normalized.used) { this.error.set('Tổng lượt phát hành không được thấp hơn số lượt đã dùng.'); return; }
    const isEditing = this.editing();
    this.data.saveVoucher(normalized, isEditing); this.form.set(null); this.editOriginal.set(null);
    this.toast.set(isEditing ? 'Đã cập nhật voucher.' : `Đã tạo voucher ${normalized.code}.`);
  }
  requestLock(code: string, locked: boolean): void {
    const item = this.vouchers().find(entry => entry.code === code);
    if (!item) return;
    const status = this.statusOf(item);
    const eligible = locked ? ['active', 'scheduled'].includes(status) : item.locked && status !== 'expired';
    if (eligible) this.confirm.set({ items: [item], locked });
  }
  /** Mở hộp xác nhận xoá voucher. */
  requestDelete(item: BusinessVoucher): void {
    this.detail.set(null);
    this.deleting.set(item);
    this.error.set('');
  }
  closeDelete(): void {
    this.deleting.set(null);
    this.error.set('');
  }
  confirmDelete(): void {
    const item = this.deleting(); if (!item) return;
    this.data.deleteVoucher(item.code);
    this.closeDelete();
    this.toast.set(`Đã xoá voucher ${item.code} khỏi danh sách phát hành.`);
  }
  /** Voucher đã dùng cho đơn hàng thì không được xoá vì cần đối soát. */
  canDelete(item: BusinessVoucher): boolean {
    return item.used === 0;
  }
  audienceLabel(value: VoucherAudience): string {
    return value === 'new_learner' ? 'Học viên mới' : 'Tất cả học viên';
  }
  auditActionLabel(action: string): string {
    return {
      created: 'Tạo voucher',
      updated: 'Cập nhật điều kiện',
      locked: 'Tạm khoá',
      unlocked: 'Mở khoá',
      deleted: 'Xoá voucher'
    }[action] ?? action;
  }
  applyLock(): void {
    const action = this.confirm(); if (!action) return;
    const { items, locked } = action;
    const eligible = items.filter(item => locked
      ? this.statusOf(item) !== 'expired'
      : (item.locked && item.endsAt > this.localNow() && item.used < item.limit));
    this.data.setVoucherLock(eligible.map(item => item.code), locked);
    this.toast.set(eligible.length
      ? `Đã ${locked ? 'tạm khóa' : 'mở khóa'} ${eligible.length} voucher${eligible.length > 1 ? '' : ' ' + eligible[0].code}.`
      : `Voucher đã hết hạn hoặc hết lượt nên không thể mở khóa.`);
    this.selectedCodes.set([]); this.confirm.set(null);
  }
  confirmLead(action: { items: BusinessVoucher[]; locked: boolean }): string {
    const count = action.items.length;
    if (count === 1) return action.locked ? 'Bạn có chắc chắn muốn khóa mã voucher này không?' : 'Bạn có chắc chắn muốn mở khóa voucher này không?';
    return action.locked ? `Bạn có chắc chắn muốn khóa ${count} mã voucher này không?` : `Bạn có chắc chắn muốn mở khóa ${count} mã voucher này không?`;
  }
  confirmHint(action: { items: BusinessVoucher[]; locked: boolean }): string {
    if (action.locked) return 'Voucher sẽ ngừng nhận giao dịch mới. Các đơn đã dùng voucher này vẫn được giữ nguyên.';
    return 'Voucher chỉ phát hành lại khi đã tới ngày bắt đầu, còn hạn và còn lượt sử dụng.';
  }
  confirmCodes(action: { items: BusinessVoucher[]; locked: boolean }): string {
    return action.items.map(item => item.code).join(', ');
  }
  confirmNextStatus(action: { items: BusinessVoucher[]; locked: boolean }): string {
    if (action.locked) return 'Tạm khóa';
    if (action.items.length === 1) return this.statusAfterAction(action.items[0], false);
    return 'Tùy thời hạn và lượt sử dụng';
  }
  sponsorLabel(item: BusinessVoucher): string {
    if (item.sponsor === 'thinkup') return 'ThinkUp tài trợ';
    return item.instructor?.trim() ? `${item.instructor.trim()} tài trợ` : 'Giảng viên tài trợ';
  }
  statusAfterAction(item: BusinessVoucher, locked: boolean): string {
    if (locked) return 'Tạm khóa';
    return item.startsAt > this.localNow() ? 'Chưa bắt đầu' : 'Đang phát hành';
  }
  export(format: ExportFormat): void { downloadTable(format, 'thinkup-voucher', [['Mã', 'Nguồn tài trợ', 'Mức giảm', 'Đơn tối thiểu', 'Đã dùng', 'Giới hạn', 'Bắt đầu', 'Kết thúc', 'Trạng thái'], ...this.filtered().map(item => [item.code, item.sponsor === 'thinkup' ? 'ThinkUp' : item.instructor ?? 'Giảng viên', this.discount(item), item.minOrder, item.used, item.limit, item.startsAt, item.endsAt, this.statusLabel(this.statusOf(item))])]); }
}
