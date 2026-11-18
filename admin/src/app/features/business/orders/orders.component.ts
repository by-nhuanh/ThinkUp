import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { LucideRotateCcw } from '@lucide/angular';
import { BusinessOrder, OrderStatus } from '../models/business.models';
import { BUSINESS_STORE } from '../services/business.store';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { copyText, dateTime, matchesDates, money, paginationItems } from '../business-utils';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';

type OrderColumn = 'learner' | 'method' | 'status' | 'date';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [AdminDialogComponent, BulkSelectionDialogComponent, SelectionBarComponent, DateTimePickerComponent, CustomSelectComponent, ExportMenuComponent, SearchFieldComponent, ColumnFilterComponent, LucideRotateCcw],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent {
  private readonly data = inject(BUSINESS_STORE);
  private readonly invoicePdf = inject(InvoicePdfService);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private detailTrigger: HTMLElement | null = null;
  private readonly repositionDatePopover = () => this.positionDatePopover();
  readonly money = money;
  readonly search = signal('');
  readonly status = signal<OrderStatus | ''>('');
  readonly method = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly activePeriod = signal<'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | ''>('all');
  /** Khoảng thời gian đang chỉnh trong popover, chỉ áp dụng khi bấm "Áp dụng". */
  readonly fromDraft = signal('');
  readonly toDraft = signal('');
  readonly periodDraft = signal<'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | ''>('all');
  readonly canClearDateRange = computed(() => !!(this.from() || this.to() || this.fromDraft() || this.toDraft()));
  readonly dateOpen = signal(false);
  readonly datePopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null);
  readonly sort = signal<'newest' | 'oldest'>('newest');
  /** Bộ lọc nhiều lựa chọn trên tiêu đề cột; rỗng nghĩa là không lọc cột đó. */
  readonly learnerColumnFilters = signal<string[]>([]);
  readonly methodColumnFilters = signal<string[]>([]);
  readonly statusColumnFilters = signal<string[]>([]);
  readonly dateColumnFilters = signal<string[]>([]);
  readonly learnerValues = computed<ColumnFilterValue[]>(() =>
    this.distinctValues(this.orders().map(order => order.learner)));
  readonly methodValues = computed<ColumnFilterValue[]>(() =>
    this.distinctValues(this.orders().map(order => this.methodLabel(order.method))));
  readonly statusValues: ColumnFilterValue[] = [
    { value: 'success', label: 'Thành công' },
    { value: 'pending', label: 'Chờ thanh toán' },
    { value: 'cancelled', label: 'Thất bại' }
  ];
  readonly dateValues = computed<ColumnFilterValue[]>(() =>
    this.distinctValues(this.orders().map(order => this.dayOf(order.createdAt))));
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: OrderColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly page = signal(1);
  readonly selected = signal<BusinessOrder | null>(null);
  readonly downloadingInvoiceId = signal<string | null>(null);
  readonly invoiceError = signal('');
  readonly copiedOrderId = signal<string | null>(null);
  private copiedTimeout: ReturnType<typeof setTimeout> | null = null;
  readonly methods = ['Thẻ ATM / nội địa', 'Ví điện tử', 'Chuyển khoản ngân hàng', 'QR ThinkUp', 'Thẻ tín dụng / ghi nợ quốc tế', 'PayPal', 'Apple Pay', 'Google Pay', 'Chuyển khoản quốc tế'];
  readonly methodOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả phương thức' }, ...this.methods.map(method => ({ value: method, label: method }))];
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'success', label: 'Thành công' },
    { value: 'pending', label: 'Chờ thanh toán' },
    { value: 'cancelled', label: 'Thất bại' }
  ];
  readonly orders = this.data.orders;
  readonly loading = this.data.loading;
  readonly loadError = this.data.error;
  /** KPI lấy từ `GET /admin/business/orders/summary`; tỷ lệ tính từ chính các con số đó. */
  readonly orderSummary = computed(() => {
    const totals = this.data.orderTotals();
    const rate = (value: number): number => totals.total ? Math.round(value / totals.total * 1000) / 10 : 0;
    return {
      total: totals.total,
      success: totals.success,
      pending: totals.pending,
      cancelled: totals.cancelled,
      successRate: rate(totals.success),
      cancelledRate: rate(totals.cancelled)
    };
  });
  readonly filtered = computed(() => {
    const items = this.orders().filter(order => {
      const query = this.search().trim().toLocaleLowerCase('vi-VN');
      return (!query || [order.id, order.transactionId ?? '', order.learner, order.email].some(value => value.toLocaleLowerCase('vi-VN').includes(query)))
        && (!this.status() || order.status === this.status())
        && (!this.method() || this.methodMatches(order.method, this.method()))
        && this.matchesColumn(this.learnerColumnFilters(), order.learner)
        && this.matchesColumn(this.methodColumnFilters(), this.methodLabel(order.method))
        && (!this.statusColumnFilters().length || this.statusColumnFilters().includes(order.status))
        && (!this.dateColumnFilters().length || this.dateColumnFilters().includes(this.dayOf(order.createdAt)))
        && matchesDates(order.createdAt, this.from(), this.to());
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return [...items].sort((a, b) => this.sort() === 'newest'
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt));
  });
  /** Số dòng mỗi trang đọc từ tham số hệ thống `orders_per_page` (mặc định 8). */
  private readonly pageSizeService = inject(AdminPageSizeService);
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pagination = computed(() => paginationItems(this.page(), this.pages()));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly dateLabel = computed(() => this.from() || this.to()
    ? `${this.shortDate(this.from()) || '...'} - ${this.shortDate(this.to()) || '...'}`
    : 'Tất cả');
  readonly total = computed(() => this.orders().length);
  readonly success = computed(() => this.orders().filter(order => order.status === 'success').length);
  readonly pending = computed(() => this.orders().filter(order => order.status === 'pending').length);
  readonly cancelled = computed(() => this.orders().filter(order => order.status === 'cancelled').length);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkCancelIds = signal<readonly string[] | null>(null);
  readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(order => chosen.has(order.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(order => this.selection().has(order.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.orders()
    .filter(order => this.selection().has(order.id))
    .map(order => this.selectionItem(order)));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(order => !this.selection().has(order.id))
    .map(order => this.selectionItem(order)));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => {
    const pendingCount = this.orders().filter(order => this.selection().has(order.id) && order.status === 'pending').length;
    const pendingTitle = pendingCount ? `${pendingCount} đơn chờ thanh toán trong lựa chọn` : 'Chỉ áp dụng cho đơn chờ thanh toán';
    return [
      { key: 'confirm-payment', label: 'Xác nhận thanh toán', tone: 'primary', disabled: !pendingCount, title: pendingTitle },
      { key: 'cancel', label: 'Hủy đơn', tone: 'danger', disabled: !pendingCount, title: pendingTitle },
      { key: 'export', label: 'Xuất đã chọn' }
    ];
  });
  readonly bulkCancelTargets = computed(() => {
    const ids = this.bulkCancelIds();
    return ids ? this.orders().filter(order => ids.includes(order.id) && order.status === 'pending') : [];
  });

  constructor() {
    // Deep link từ module người dùng: /business/orders?q=<email>
    const query = this.route.snapshot.queryParamMap.get('q');
    if (query) this.search.set(query);
    void this.reload();
    this.destroyRef.onDestroy(() => this.removeDatePopoverListeners());
    this.destroyRef.onDestroy(() => { if (this.copiedTimeout) clearTimeout(this.copiedTimeout); });
    this.destroyRef.onDestroy(() => { if (this.toastTimer) clearTimeout(this.toastTimer); });
  }

  /** Tải lại danh sách và KPI theo bộ lọc hiện tại (dùng cho lần đầu và nút thử lại). */
  async reload(): Promise<void> {
    await this.data.reloadOrders({
      q: this.search().trim() || undefined,
      status: this.status() || undefined,
      method: this.method() || undefined,
      from: this.from() || undefined,
      to: this.to() || undefined,
      sort: this.sort()
    });
  }

  toggleDatePopover(): void {
    if (this.dateOpen()) { this.closeDatePopover(); return; }
    this.datePopoverPosition.set(null);
    // Popover mở ra với bản nháp bằng đúng khoảng thời gian đang áp dụng.
    this.fromDraft.set(this.from());
    this.toDraft.set(this.to());
    this.periodDraft.set(this.activePeriod());
    this.dateOpen.set(true);
    const view = this.document.defaultView;
    view?.addEventListener('resize', this.repositionDatePopover);
    view?.addEventListener('scroll', this.repositionDatePopover, true);
    setTimeout(() => this.positionDatePopover());
  }

  closeDatePopover(): void {
    this.dateOpen.set(false);
    this.datePopoverPosition.set(null);
    this.removeDatePopoverListeners();
  }

  private removeDatePopoverListeners(): void {
    const view = this.document.defaultView;
    view?.removeEventListener('resize', this.repositionDatePopover);
    view?.removeEventListener('scroll', this.repositionDatePopover, true);
  }

  private positionDatePopover(): void {
    if (!this.dateOpen()) return;
    const view = this.document.defaultView;
    const trigger = this.document.querySelector<HTMLElement>('.date-trigger');
    const popover = this.document.getElementById('order-date-options');
    if (!view || !trigger || !popover) return;
    const margin = 12;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = Math.min(popoverRect.width, view.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(triggerRect.left, view.innerWidth - margin - width));
    const below = view.innerHeight - triggerRect.bottom - gap - margin;
    const above = triggerRect.top - gap - margin;
    const openAbove = below < popoverRect.height && above > below;
    const maxHeight = Math.max(0, openAbove ? above : below);
    const top = openAbove ? Math.max(margin, triggerRect.top - gap - Math.min(popoverRect.height, maxHeight)) : triggerRect.bottom + gap;
    this.datePopoverPosition.set({ left, top, maxHeight });
  }

  setStatus(value: OrderStatus | ''): void { this.status.set(value); this.page.set(1); }
  setMethod(value: string): void { this.method.set(value); this.page.set(1); }
  statusFilterLabel(): string { return this.statusOptions.find(option => option.value === this.status())?.label ?? 'Tất cả trạng thái'; }
  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  /** Chỉnh ngày bắt đầu trong popover, chưa áp dụng cho bộ lọc. */
  selectFrom(value: string): void { this.fromDraft.set(value); if (this.toDraft() && value > this.toDraft()) this.toDraft.set(value); this.periodDraft.set(''); }
  /** Chỉnh ngày kết thúc trong popover, chưa áp dụng cho bộ lọc. */
  selectTo(value: string): void { this.toDraft.set(value); if (this.fromDraft() && value < this.fromDraft()) this.fromDraft.set(value); this.periodDraft.set(''); }
  toggleSort(): void { this.sort.update(value => value === 'newest' ? 'oldest' : 'newest'); this.columnSort.set(null); this.page.set(1); }
  private today(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  timeOf(value: string): string { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  dateOf(value: string): string { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  dateTimeSecond(value: string): string {
    const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
    return `${this.dateOf(value)} ${time}`;
  }
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
  selectPeriod(value: string): void {
    const range = this.periodRange(value);
    this.fromDraft.set(range.from);
    this.toDraft.set(range.to);
    this.periodDraft.set(value as 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | '');
  }
  /** Áp dụng khoảng thời gian đang chọn trong popover. */
  applyDateRange(): void {
    this.from.set(this.fromDraft());
    this.to.set(this.toDraft());
    this.activePeriod.set(this.periodDraft());
    this.page.set(1);
    this.closeDatePopover();
  }
  /** Xoá khoảng thời gian đang lọc. */
  clearDateRange(): void {
    this.from.set('');
    this.to.set('');
    this.activePeriod.set('all');
    this.fromDraft.set('');
    this.toDraft.set('');
    this.periodDraft.set('all');
    this.page.set(1);
  }
  clear(): void {
    this.search.set('');
    this.status.set('');
    this.method.set('');
    this.learnerColumnFilters.set([]);
    this.methodColumnFilters.set([]);
    this.statusColumnFilters.set([]);
    this.dateColumnFilters.set([]);
    this.clearDateRange();
    this.sort.set('newest');
    this.columnSort.set(null);
    this.page.set(1);
    this.closeDatePopover(); void this.reload();
  }
  /** Áp dụng lựa chọn từ bộ lọc tiêu đề cột và đưa danh sách về trang đầu. */
  setColumnFilter(kind: 'learner' | 'method' | 'status' | 'date', values: string[]): void {
    if (kind === 'learner') this.learnerColumnFilters.set(values);
    else if (kind === 'method') this.methodColumnFilters.set(values);
    else if (kind === 'status') this.statusColumnFilters.set(values);
    else this.dateColumnFilters.set(values);
    this.page.set(1);
  }
  sortFor(key: OrderColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }
  updateColumnSort(key: OrderColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }
  private sortValue(item: BusinessOrder, column: OrderColumn): string | number {
    switch (column) {
      case 'learner': return item.learner;
      case 'method': return this.methodLabel(item.method);
      case 'status': return this.statusLabel(item.status);
      case 'date': return Date.parse(item.createdAt);
    }
  }
  private matchesColumn(selected: string[], value: string): boolean {
    return !selected.length || selected.includes(value);
  }
  /** Danh sách giá trị khác nhau, giữ thứ tự xuất hiện, dùng cho bộ lọc cột. */
  private distinctValues(values: string[]): ColumnFilterValue[] {
    return [...new Set(values)].map(value => ({ value, label: value }));
  }
  /** Ngày tạo dạng YYYY-MM-DD theo giờ Việt Nam, dùng cho bộ lọc cột Ngày tạo. */
  dayOf(value: string): string {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
  }
  private selectionItem(order: BusinessOrder): BulkSelectionItem {
    return { id: order.id, label: `${order.id} · ${order.learner}`, detail: `${money(order.originalAmount - order.discount)} · ${this.statusLabel(order.status)}` };
  }
  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    if (checked) next.add(id); else next.delete(id);
    this.selection.set(next);
  }
  toggleSelectAll(): void {
    const next = new Set(this.selection());
    if (this.allVisibleSelected()) this.visible().forEach(order => next.delete(order.id));
    else this.visible().forEach(order => next.add(order.id));
    this.selection.set(next);
  }
  clearSelection(): void { this.selection.set(new Set()); }
  setSelectionIds(ids: string[]): void { this.selection.set(new Set(ids)); }
  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    const targets = ids ?? this.selectedIds();
    if (!targets.length) return;
    if (key === 'export') { this.exportSelected(targets); return; }
    if (key === 'cancel') { this.bulkCancelIds.set(targets); return; }
    if (key === 'confirm-payment') this.confirmSelectedPayments(targets);
  }
  private confirmSelectedPayments(ids: readonly string[]): void {
    const targets = this.orders().filter(order => ids.includes(order.id) && order.status === 'pending');
    if (!targets.length) { this.notify('Không có đơn chờ thanh toán nào trong lựa chọn.'); return; }
    const paidAt = new Date().toISOString();
    targets.forEach(order => this.data.updateOrder(order.id, { status: 'success', paidAt }));
    this.clearSelection();
    this.page.set(Math.min(this.page(), this.pages()));
    const skipped = ids.length - targets.length;
    this.notify(`Đã xác nhận thanh toán ${targets.length} đơn hàng.${skipped ? ` Bỏ qua ${skipped} đơn không ở trạng thái chờ thanh toán.` : ''}`);
  }
  confirmBulkCancel(): void {
    const ids = this.bulkCancelIds();
    if (!ids?.length) return;
    const targets = this.bulkCancelTargets();
    this.bulkCancelIds.set(null);
    if (!targets.length) { this.notify('Các đơn đã chọn không còn ở trạng thái chờ thanh toán nên không thể hủy.'); return; }
    const cancelledAt = new Date().toISOString();
    targets.forEach(order => this.data.updateOrder(order.id, {
      status: 'cancelled',
      cancellation: { reason: 'Quản trị viên hủy đơn hàng loạt.', cancelledAt, cancelledBy: 'admin', paymentState: 'unpaid' }
    }));
    this.clearSelection();
    this.page.set(Math.min(this.page(), this.pages()));
    const skipped = ids.length - targets.length;
    this.notify(`Đã hủy ${targets.length} đơn hàng.${skipped ? ` Bỏ qua ${skipped} đơn không ở trạng thái chờ thanh toán.` : ''}`);
  }
  private exportSelected(ids: readonly string[]): void {
    const rows = this.orders().filter(order => ids.includes(order.id));
    downloadTable('xlsx', 'thinkup-don-hang-da-chon', [
      ['Mã đơn', 'Mã giao dịch', 'Học viên', 'Email', 'Khóa học', 'Thực thu', 'Phương thức', 'Trạng thái', 'Ngày tạo'],
      ...rows.map(order => [order.id, order.transactionId ?? '', order.learner, order.email, order.courses.join('; '), order.originalAmount - order.discount, this.methodLabel(order.method), this.statusLabel(order.status), dateTime(order.createdAt)])
    ]).then(
      () => this.notify(`Đã xuất ${rows.length} đơn hàng đã chọn ra tệp XLSX.`),
      () => this.notify('Không thể tạo tệp xuất. Vui lòng thử lại.')
    );
  }
  private notify(message: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(''), 4200);
  }
  async export(format: ExportFormat): Promise<void> {
    try {
      await this.data.exportOrders(format, {
        q: this.search().trim() || undefined,
        status: this.status() || undefined,
        method: this.method() || undefined,
        from: this.from() || undefined,
        to: this.to() || undefined,
        sort: this.sort()
      });
    } catch (error) {
      this.invoiceError.set(apiErrorMessage(error, 'Không xuất được danh sách đơn hàng. Vui lòng thử lại.'));
    }
  }
  methodMatches(actual: string, filter: string): boolean {
    if (filter === 'QR ThinkUp') return actual === 'QR Code' || actual === filter;
    if (filter === 'Ví điện tử') return actual === 'MoMo';
    if (filter === 'Apple Pay' || filter === 'Google Pay') return actual === filter;
    return actual === filter;
  }
  methodLabel(method: string): string { return method === 'QR Code' ? 'QR ThinkUp' : method; }
  statusLabel(status: OrderStatus): string { return { success: 'Thành công', pending: 'Chờ thanh toán', cancelled: 'Đã hủy' }[status]; }
  openDetail(order: BusinessOrder, event: Event): void {
    this.detailTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selected.set(order);
    setTimeout(() => this.document.getElementById('order-detail-close')?.focus());
  }
  closeDetail(): void {
    if (this.downloadingInvoiceId()) return;
    this.selected.set(null);
    this.invoiceError.set('');
    setTimeout(() => this.detailTrigger?.focus());
  }
  paymentDeadline(order: BusinessOrder): Date { return new Date(new Date(order.createdAt).getTime() + 15 * 60_000); }
  paymentStateLabel(order: BusinessOrder): string {
    const state = order.cancellation?.paymentState ?? 'unknown';
    return { unpaid: 'Chưa ghi nhận thanh toán', paid: 'Đã thanh toán', refunded: 'Đã hoàn tiền', unknown: 'Chưa xác định trạng thái thanh toán' }[state];
  }
  orderCourses(order: BusinessOrder): { courseName: string; salePrice: number }[] {
    if (order.courseItems?.length) return order.courseItems;
    const total = order.originalAmount - order.discount;
    const count = order.courses.length;
    if (!count) return [];
    // TODO(pre-deploy): Thay giá phân bổ demo này bằng salePrice từng khóa từ API đơn hàng.
    const base = Math.floor(total / count);
    return order.courses.map((courseName, index) => ({ courseName, salePrice: index === count - 1 ? total - base * (count - 1) : base }));
  }
  async copyOrderId(order: BusinessOrder): Promise<void> {
    if (!await copyText(order.id)) {
      this.invoiceError.set('Không thể sao chép mã đơn. Vui lòng thử lại.');
      return;
    }
    this.copiedOrderId.set(order.id);
    if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => this.copiedOrderId.set(null), 1800);
  }
  instructorBase(order: BusinessOrder): number { return order.originalAmount - (order.sponsor === 'instructor' ? order.discount : 0); }
  instructorShare(order: BusinessOrder): number { return Math.round(this.instructorBase(order) * 0.4); }
  platformShare(order: BusinessOrder): number { return order.originalAmount - order.discount - this.instructorShare(order); }

  /** Nhãn dòng tiền của học viên đổi theo trạng thái đơn. */
  learnerPaidLabel(order: BusinessOrder): string {
    if (order.status === 'success') return 'Học viên thực trả';
    return order.status === 'pending' ? 'Học viên cần trả' : 'Học viên không trả';
  }

  /**
   * Số tiền ghi nhận cho từng bên theo trạng thái đơn.
   * Đơn đã hủy thì không phát sinh doanh thu nên các khoản đều bằng 0.
   */
  allocatedAmount(order: BusinessOrder, kind: 'learner' | 'instructor' | 'platform'): number {
    if (order.status === 'cancelled') return 0;
    if (kind === 'learner') return order.originalAmount - order.discount;
    if (kind === 'instructor') return this.instructorShare(order);
    return this.platformShare(order);
  }

  /** Ghi chú cuối khối phân bổ, nội dung đổi theo trạng thái đơn. */
  revenueNote(order: BusinessOrder): string {
    if (order.status === 'cancelled') return 'Đơn hàng đã hủy nên không ghi nhận doanh thu.';
    if (order.status === 'pending') return 'Đơn hàng chưa thanh toán; phân bổ doanh thu chỉ được ghi nhận khi thanh toán thành công.';
    if (order.discount <= 0) return '';
    return order.sponsor === 'instructor'
      ? 'Giảng viên tài trợ voucher; doanh thu chia trên giá sau giảm.'
      : 'ThinkUp bù phần giảm giá; tỷ lệ giảng viên tính trên giá gốc.';
  }

  /** Voucher của đơn đã hủy được hoàn lại ví học viên. */
  voucherRefundNote(order: BusinessOrder): string {
    if (order.status !== 'cancelled' || !order.voucherCode) return '';
    return `Voucher ${order.voucherCode} đã được hoàn lại vào ví học viên.`;
  }
  async downloadInvoice(order: BusinessOrder): Promise<void> {
    if (this.downloadingInvoiceId()) return;
    this.invoiceError.set('');
    this.downloadingInvoiceId.set(order.id);
    try {
      await this.invoicePdf.download(order);
    } catch {
      this.invoiceError.set('Không thể tạo hóa đơn PDF. Vui lòng thử lại.');
    } finally {
      this.downloadingInvoiceId.set(null);
    }
  }
}
