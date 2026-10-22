import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideInfo, LucideUpload, LucideX } from '@lucide/angular';
import { BusinessDemoService } from '../services/business-demo.service';
import { PayoutRequest, PayoutStatus } from '../models/business.models';
import { copyText, dateTime, matchesDates, money, paginationItems } from '../business-utils';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';

/** Đơn vị nhập hạn mức rút tiền. */
export type LimitUnit = 'vnd' | 'nghin' | 'trieu' | 'ty';

/** Hệ số quy đổi từ đơn vị sang VNĐ. */
const LIMIT_UNIT_FACTORS: Record<LimitUnit, number> = {
  vnd: 1,
  nghin: 1_000,
  trieu: 1_000_000,
  ty: 1_000_000_000
};

@Component({ selector: 'app-payouts', standalone: true, imports: [FormsModule, DateTimePickerComponent, CustomSelectComponent, ExportMenuComponent, SearchFieldComponent, LucideX, LucideUpload, LucideInfo], templateUrl: './payouts.component.html', styleUrl: './payouts.component.css' })
export class PayoutsComponent {
  private readonly data = inject(BusinessDemoService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly repositionDatePopover = () => this.positionDatePopover();
  private copyToastTimer: ReturnType<typeof setTimeout> | null = null;
  readonly money = money;
  readonly dateTime = dateTime;
  readonly Math = Math;
  readonly payouts = this.data.payouts;
  readonly search = signal('');
  readonly status = signal<PayoutStatus | ''>('');
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Chờ giải ngân' },
    { value: 'paid', label: 'Đã giải ngân' },
    { value: 'rejected', label: 'Bị từ chối' }
  ];
  readonly limitMin = signal<number | null>(null);
  readonly limitMax = signal<number | null>(null);
  /** Hạn mức nháp luôn tính theo đơn vị đang chọn, áp dụng mới quy đổi sang VNĐ. */
  readonly limitMinDraft = signal(0);
  readonly limitMaxDraft = signal(999000);
  readonly limitOpen = signal(false);
  readonly quickOpen = signal(false);
  readonly datePopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null);
  /** Trần hạn mức: 999 tỷ. */
  readonly maxLimit = 999_000_000_000;
  /** Đơn vị nhập hạn mức: số tiền rất lớn nên người dùng chọn đơn vị thay vì chỉ dùng VNĐ. */
  readonly limitUnit = signal<LimitUnit>('trieu');
  readonly limitUnitOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'vnd', label: 'VNĐ' },
    { value: 'nghin', label: 'Nghìn' },
    { value: 'trieu', label: 'Triệu' },
    { value: 'ty', label: 'Tỷ' }
  ];
  readonly from = signal('');
  readonly to = signal('');
  readonly sort = signal<'newest' | 'oldest'>('newest');
  readonly taxOnly = signal(false);
  readonly paidMonthOnly = signal(false);
  readonly role = this.data.payoutRole;
  readonly selected = signal<PayoutRequest | null>(null);
  readonly openActionMenuId = signal<string | null>(null);
  readonly dialog = signal<'details' | 'review' | 'reject' | null>(null);
  private readonly returnFromReject = signal<'details' | 'review'>('details');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly quickRange = signal<'all' | 'today' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  /** Khoảng thời gian đang chỉnh trong popover, chỉ áp dụng khi bấm "Áp dụng". */
  readonly fromDraft = signal('');
  readonly toDraft = signal('');
  readonly rangeDraft = signal<'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  readonly canClearDateRange = computed(() => !!(this.from() || this.to() || this.fromDraft() || this.toDraft()));
  readonly dateLabel = computed(() => this.from() || this.to()
    ? `${this.shortDate(this.from()) || '...'} - ${this.shortDate(this.to()) || '...'}`
    : 'Tất cả');
  readonly approvalNote = signal('');
  readonly rejectionReason = signal('');
  readonly rejectionDetails = signal('');
  readonly rejectReasonOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'Sai số tài khoản', label: 'Sai số tài khoản' },
    { value: 'Tên tài khoản không khớp', label: 'Tên tài khoản không khớp' },
    { value: 'Doanh thu không khả dụng', label: 'Doanh thu không khả dụng' },
    { value: 'Hợp đồng không hợp lệ', label: 'Hợp đồng không hợp lệ' },
    { value: 'Khác', label: 'Khác' }
  ];
  readonly evidence = signal('');
  readonly error = signal('');
  readonly toast = signal('');
  readonly copiedId = signal(false);
  readonly filtered = computed(() => this.payouts().filter(item => {
    const query = this.search().trim().toLocaleLowerCase('vi-VN');
    return (!query || [item.id, item.instructor, item.email].some(value => value.toLocaleLowerCase('vi-VN').includes(query)))
      && (!this.status() || item.status === this.status())
      && (this.limitMin() === null || item.amount >= this.limitMin()!)
      && (this.limitMax() === null || item.amount <= this.limitMax()!)
      && (!this.taxOnly() || item.taxAmount > 0)
      && matchesDates(this.paidMonthOnly() && item.paidAt ? item.paidAt : item.submittedAt, this.from(), this.to());
  }).sort((a, b) => this.sort() === 'newest'
    ? b.submittedAt.localeCompare(a.submittedAt)
    : a.submittedAt.localeCompare(b.submittedAt)));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly pagination = computed(() => paginationItems(this.currentPage(), this.totalPages()));
  readonly visible = computed(() => this.filtered().slice((this.currentPage() - 1) * this.pageSize, this.currentPage() * this.pageSize));
  readonly pending = computed(() => this.payouts().filter(item => item.status === 'pending').length);
  readonly largePending = computed(() => this.payouts().filter(item => item.status === 'pending' && item.amount >= 20000000).length);
  readonly awaitingAmount = computed(() => this.payouts().filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount - item.taxAmount, 0));
  readonly paidAmount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, item) => sum + item.amount - item.taxAmount, 0));
  readonly paidCount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length);
  readonly taxAmount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, item) => sum + item.taxAmount, 0));

  constructor() {
    this.destroyRef.onDestroy(() => this.removeDatePopoverListeners());
  }

  statusLabel(value: PayoutStatus): string { return { pending: 'Chờ duyệt', approved: 'Chờ giải ngân', paid: 'Đã giải ngân', rejected: 'Bị từ chối' }[value]; }
  toggleRowActions(id: string): void { this.openActionMenuId.update(current => current === id ? null : id); }
  closeRowActions(): void { this.openActionMenuId.set(null); }
  setStatus(value: PayoutStatus | ''): void { this.status.set(value); this.taxOnly.set(false); this.paidMonthOnly.set(false); this.page.set(1); }
  filterFromKpi(value: PayoutStatus): void { this.setStatus(value); this.clearDateRange(); }
  clear(): void { this.search.set(''); this.status.set(''); this.limitMin.set(null); this.limitMax.set(null); this.limitMinDraft.set(0); this.limitMaxDraft.set(this.limitSliderMax()); this.limitOpen.set(false); this.closeDatePopover(); this.clearDateRange(); this.taxOnly.set(false); this.paidMonthOnly.set(false); this.sort.set('newest'); this.page.set(1); }
  toggleSort(): void { this.sort.update(value => value === 'newest' ? 'oldest' : 'newest'); this.page.set(1); }
  formatLimit(value: number): string { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: this.limitPrecision() }).format(value); }
  /** Rút gọn số tiền cho nút trên toolbar: 1.234.567.890 → "1,2 tỷ". */
  formatLimitCompact(value: number): string {
    for (const [factor, label] of [[1_000_000_000, 'tỷ'], [1_000_000, 'triệu'], [1_000, 'nghìn']] as [number, string][]) {
      if (value >= factor) {
        const scaled = value / factor;
        return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: scaled < 10 ? 1 : 0 }).format(scaled)} ${label}`;
      }
    }
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  /**
   * Ô nhập hạn mức: bỏ ký tự không phải số, giới hạn theo maxLimit rồi hiển thị
   * lại theo dạng xxx.xxx. Con trỏ được giữ đúng chỗ sau khi định dạng.
   */
  updateLimitInput(kind: 'min' | 'max', input: HTMLInputElement): void {
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = input.value.slice(0, caret).replace(/\D/g, '').length;
    const value = this.normalizeLimit(this.parseLimitInput(input.value));
    const normalized = kind === 'min' ? Math.min(value, this.limitMaxDraft()) : Math.max(value, this.limitMinDraft());
    input.value = this.formatLimit(normalized);
    if (kind === 'min') this.limitMinDraft.set(normalized); else this.limitMaxDraft.set(normalized);
    this.keepCaret(input, digitsBefore);
  }
  private keepCaret(input: HTMLInputElement, digitsBefore: number): void {
    const position = this.caretPosition(input.value, digitsBefore);
    setTimeout(() => input.setSelectionRange(position, position));
  }
  private caretPosition(formatted: string, digitsBefore: number): number {
    if (!digitsBefore) return 0;
    let seen = 0;
    for (let index = 0; index < formatted.length; index += 1) {
      if (/\d/.test(formatted[index])) {
        seen += 1;
        if (seen === digitsBefore) return index + 1;
      }
    }
    return formatted.length;
  }
  toggleLimit(): void {
    this.limitMinDraft.set(this.limitMin() === null ? 0 : this.limitMin()! / this.limitFactor());
    this.limitMaxDraft.set(this.limitMax() === null ? this.limitSliderMax() : this.limitMax()! / this.limitFactor());
    this.closeDatePopover();
    this.limitOpen.update(open => !open);
  }
  /** Hệ số quy đổi của đơn vị đang chọn. */
  private limitFactor(): number {
    return LIMIT_UNIT_FACTORS[this.limitUnit()];
  }
  /** Đơn vị hiển thị cạnh ô nhập. */
  limitUnitLabel(): string {
    return this.limitUnitOptions.find(option => option.value === this.limitUnit())?.label ?? 'VNĐ';
  }
  /** Trần của thanh trượt theo đơn vị đang chọn. */
  limitSliderMax(): number { return this.maxLimit / this.limitFactor(); }
  /** Bước của thanh trượt theo đơn vị đang chọn. */
  limitSliderStep(): number { return Math.max(1, Math.round(1_000_000 / this.limitFactor())); }
  /** Số chữ thập phân cho phép nhập theo đơn vị (tỷ cho phép nhập 0,1 tỷ = 100 triệu). */
  private limitPrecision(): number { return this.limitUnit() === 'ty' ? 3 : 0; }
  /** Quy đổi giá trị đang nhập (theo đơn vị) sang VNĐ. */
  private limitToVnd(value: number): number { return Math.round(value * this.limitFactor()); }
  /** Đổi đơn vị nhập, giữ nguyên khoảng hạn mức đang chọn. */
  setLimitUnit(value: string): void {
    if (!(value in LIMIT_UNIT_FACTORS) || value === this.limitUnit()) return;
    const from = this.limitFactor();
    this.limitUnit.set(value as LimitUnit);
    const to = this.limitFactor();
    const convert = (current: number): number => Math.min(this.limitSliderMax(), this.roundLimit(current * from / to, value as LimitUnit));
    this.limitMinDraft.set(convert(this.limitMinDraft()));
    this.limitMaxDraft.set(convert(this.limitMaxDraft()));
  }
  private roundLimit(value: number, unit: LimitUnit): number {
    const precision = unit === 'ty' ? 3 : 0;
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
  private normalizeLimit(value: string | number): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount)) return 0;
    return Math.max(0, Math.min(this.limitSliderMax(), this.roundLimit(amount, this.limitUnit())));
  }
  /** Đọc số trong ô nhập: dấu chấm là dấu phân cách nghìn, dấu phẩy là thập phân. */
  private parseLimitInput(text: string): number {
    const cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : 0;
  }
  setLimitMinDraft(value: string | number): void { this.limitMinDraft.set(Math.min(this.normalizeLimit(value), this.limitMaxDraft())); }
  setLimitMaxDraft(value: string | number): void { this.limitMaxDraft.set(Math.max(this.normalizeLimit(value), this.limitMinDraft())); }
  limitPercent(value: number): number { return value / this.limitSliderMax() * 100; }
  applyLimit(): void {
    this.limitMin.set(this.limitToVnd(this.limitMinDraft()));
    this.limitMax.set(this.limitToVnd(this.limitMaxDraft()));
    this.limitOpen.set(false);
    this.page.set(1);
  }
  resetLimit(): void {
    this.limitMin.set(null);
    this.limitMax.set(null);
    this.limitMinDraft.set(0);
    this.limitMaxDraft.set(this.limitSliderMax());
    this.limitOpen.set(false);
    this.page.set(1);
  }
  /** Chỉnh ngày bắt đầu trong popover, chưa áp dụng cho bộ lọc. */
  selectFrom(value: string): void { this.fromDraft.set(value); if (this.toDraft() && value > this.toDraft()) this.toDraft.set(value); this.rangeDraft.set('custom'); }
  /** Chỉnh ngày kết thúc trong popover, chưa áp dụng cho bộ lọc. */
  selectTo(value: string): void { this.toDraft.set(value); if (this.fromDraft() && value < this.fromDraft()) this.fromDraft.set(value); this.rangeDraft.set('custom'); }
  /** Khoảng ngày của một mốc chọn nhanh. */
  private periodRange(value: string): { from: string; to: string } {
    const now = new Date();
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (value === 'today') return { from: iso(now), to: iso(now) };
    if (value === 'week') { const start = new Date(now); start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; }
    if (value === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    if (value === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: iso(now) };
    if (value === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    return { from: '', to: '' };
  }
  /** Chọn nhanh trong popover: chỉ cập nhật bản nháp, chờ bấm "Áp dụng". */
  selectQuickDate(value: string): void {
    const range = this.periodRange(value);
    this.fromDraft.set(range.from);
    this.toDraft.set(range.to);
    this.rangeDraft.set(value as 'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom');
  }
  /** Áp dụng khoảng thời gian đang chọn trong popover. */
  applyDateRange(): void {
    this.from.set(this.fromDraft());
    this.to.set(this.toDraft());
    this.quickRange.set(this.appliedRangeType());
    this.page.set(1);
    this.closeDatePopover();
  }
  /** Xoá khoảng thời gian đang lọc. */
  clearDateRange(): void {
    this.from.set('');
    this.to.set('');
    this.quickRange.set('all');
    this.fromDraft.set('');
    this.toDraft.set('');
    this.rangeDraft.set('all');
    this.page.set(1);
  }
  private appliedRangeType(): 'all' | 'today' | 'month' | 'quarter' | 'year' | 'custom' {
    const draft = this.rangeDraft();
    return draft === 'week' ? 'custom' : draft;
  }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  toggleQuickRange(): void {
    this.limitOpen.set(false);
    if (this.quickOpen()) { this.closeDatePopover(); return; }
    this.datePopoverPosition.set(null);
    // Popover mở ra với bản nháp bằng đúng khoảng thời gian đang áp dụng.
    this.fromDraft.set(this.from());
    this.toDraft.set(this.to());
    this.rangeDraft.set(this.quickRange());
    this.quickOpen.set(true);
    const view = this.document.defaultView;
    view?.addEventListener('resize', this.repositionDatePopover);
    view?.addEventListener('scroll', this.repositionDatePopover, true);
    setTimeout(() => this.positionDatePopover());
  }
  closeDatePopover(): void {
    this.quickOpen.set(false);
    this.datePopoverPosition.set(null);
    this.removeDatePopoverListeners();
  }
  private removeDatePopoverListeners(): void {
    const view = this.document.defaultView;
    view?.removeEventListener('resize', this.repositionDatePopover);
    view?.removeEventListener('scroll', this.repositionDatePopover, true);
  }
  private positionDatePopover(): void {
    if (!this.quickOpen()) return;
    const view = this.document.defaultView;
    const trigger = this.document.querySelector<HTMLElement>('.payouts-page .date-trigger');
    const popover = this.document.getElementById('payout-date-options');
    if (!view || !trigger || !popover) return;
    const margin = 12;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = Math.min(popoverRect.width, view.innerWidth - margin * 2);
    // Keep the popover attached to the trigger's right edge. This prevents a
    // wide, content-sized date panel from being clipped at the viewport edge.
    const preferredLeft = triggerRect.right - width;
    const left = Math.max(margin, Math.min(preferredLeft, view.innerWidth - margin - width));
    const below = view.innerHeight - triggerRect.bottom - gap - margin;
    const above = triggerRect.top - gap - margin;
    const openAbove = below < popoverRect.height && above > below;
    const maxHeight = Math.max(0, openAbove ? above : below);
    const top = openAbove ? Math.max(margin, triggerRect.top - gap - Math.min(popoverRect.height, maxHeight)) : triggerRect.bottom + gap;
    this.datePopoverPosition.set({ left, top, maxHeight });
  }
  quickDate(value: string): void {
    const range = this.periodRange(value);
    this.from.set(range.from);
    this.to.set(range.to);
    this.quickRange.set(value === 'all' ? 'all' : value === 'week' ? 'custom' : value as 'today' | 'month' | 'quarter' | 'year');
    this.page.set(1);
    this.closeDatePopover();
  }
  filterPaid(): void { this.status.set('paid'); this.taxOnly.set(false); this.paidMonthOnly.set(true); this.quickDate('month'); }
  filterTax(): void { this.status.set('paid'); this.taxOnly.set(true); this.paidMonthOnly.set(true); this.quickDate('month'); }
  canApprove(item: PayoutRequest): boolean {
    return item.status === 'pending' && this.approvalIssues(item).length === 0;
  }
  approvalIssues(item: PayoutRequest): string[] {
    const issues: string[] = [];
    const hasApprovalRole = this.role() === 'super' || (this.role() === 'finance' && item.amount < 20000000);
    if (!hasApprovalRole) issues.push('Tài khoản hiện tại không có quyền duyệt khoản tiền này.');
    if (!item.verified) issues.push('Hồ sơ định danh của giảng viên chưa được xác minh.');
    if (!item.contractValid) issues.push('Hợp đồng đối tác chưa hợp lệ hoặc cần kiểm tra lại.');
    if (item.disputed) issues.push('Yêu cầu đang có tranh chấp cần được xử lý trước.');
    if (!item.bank.trim() || !item.accountNumber.trim() || !item.accountName.trim()) issues.push('Thông tin tài khoản nhận tiền chưa đầy đủ.');
    if (item.availableBalance < item.amount) issues.push(`Số dư khả dụng không đủ để duyệt yêu cầu ${money(item.amount)}.`);
    return issues;
  }
  open(item: PayoutRequest, dialog: 'details' | 'review' | 'reject'): void { this.selected.set(item); this.returnFromReject.set('details'); this.dialog.set(dialog); this.error.set(''); this.clearCopyToast(); this.approvalNote.set(''); this.rejectionReason.set(''); this.rejectionDetails.set(''); this.evidence.set(''); }
  openReject(): void { this.returnFromReject.set(this.dialog() === 'review' ? 'review' : 'details'); this.error.set(''); this.dialog.set('reject'); }
  cancelReject(): void { this.error.set(''); this.dialog.set(this.returnFromReject()); }
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.limitOpen()) this.limitOpen.set(false);
    else if (this.quickOpen()) this.closeDatePopover();
    else if (this.dialog() === 'reject') this.cancelReject();
    else if (this.selected()) this.close();
  }
  async copyRequestId(id: string): Promise<void> {
    this.clearCopyToast();
    if (!await copyText(id)) {
      this.error.set('Không thể sao chép mã yêu cầu. Vui lòng chọn và sao chép thủ công.');
      return;
    }
    this.copiedId.set(true);
    this.copyToastTimer = setTimeout(() => this.clearCopyToast(), 2200);
  }
  private clearCopyToast(): void {
    if (this.copyToastTimer) clearTimeout(this.copyToastTimer);
    this.copyToastTimer = null;
    this.copiedId.set(false);
  }
  datePart(value: string): string { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  timePart(value: string): string { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  close(): void { this.clearCopyToast(); this.selected.set(null); this.dialog.set(null); this.error.set(''); }
  approve(): void {
    const item = this.selected(); if (!item) return;
    if (!this.canApprove(item)) { this.error.set('Chưa thể duyệt. Vui lòng xử lý các cảnh báo phía trên.'); return; }
    this.data.updatePayout(item.id, { status: 'approved' }); this.close(); this.toast.set('Đã duyệt yêu cầu. Chờ kế toán giải ngân.');
  }
  reject(): void {
    const item = this.selected(); if (!item) return;
    if (!this.rejectionReason() || !this.rejectionDetails().trim()) { this.error.set('Chọn lý do và nhập giải thích chi tiết trước khi xác nhận.'); return; }
    this.data.updatePayout(item.id, { status: 'rejected', rejectionReason: `${this.rejectionReason()}: ${this.rejectionDetails().trim()}` });
    this.close(); this.toast.set('Đã từ chối yêu cầu.');
  }
  chooseEvidence(event: Event): void { this.evidence.set((event.target as HTMLInputElement).files?.[0]?.name ?? ''); }
  export(format: ExportFormat): void { downloadTable(format, 'thinkup-rut-tien', [['Mã yêu cầu', 'Giảng viên', 'Email', 'Số tiền yêu cầu', 'Thuế TNCN', 'Thực chi', 'Ngân hàng', 'Số tài khoản', 'Ngày gửi', 'Trạng thái'], ...this.filtered().map(item => [item.id, item.instructor, item.email, item.amount, item.taxAmount, item.amount - item.taxAmount, item.bank, item.accountNumber, dateTime(item.submittedAt), this.statusLabel(item.status)])]); }
}
