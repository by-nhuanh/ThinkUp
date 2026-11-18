import { DatePipe } from '@angular/common';
import { Component, DestroyRef, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideCircleCheck, LucideClock, LucideEye, LucideFilter, LucideGauge, LucidePaperclip, LucideRefreshCw, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { SUPPORT_TOPICS } from '../../../core/data/mock/support.mock';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ColumnFilterComponent, ColumnFilterValue, NUMBER_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { ColumnVisibilityComponent, TableColumnOption } from '../../../shared/components/column-visibility/column-visibility.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { TableColumnResizeDirective } from '../../../shared/directives/table-column-resize.directive';
import { SupportFilterModalComponent } from '../components/support-filter-modal/support-filter-modal.component';
import { SupportPaginationComponent } from '../components/support-pagination/support-pagination.component';
import { Priority, SupportTicket, TicketStatus } from '../models/support.models';
import { SupportDemoService } from '../services/support-demo.service';

type FilterPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | '';
type TicketQuickFilter = 'unassigned' | 'processing' | 'overdue' | 'resolvedToday' | 'onTime' | '';
interface TicketFilters { topic: string; priority: Priority | ''; status: TicketStatus | 'overdue' | ''; assignee: string; from: string; to: string; period: FilterPeriod; quick: TicketQuickFilter; }
interface FilterChip { key: keyof TicketFilters; label: string; }
const EMPTY_TICKET_FILTERS: TicketFilters = { topic: '', priority: '', status: '', assignee: '', from: '', to: '', period: 'all', quick: '' };
type TicketColumn = 'id' | 'sender' | 'topic' | 'priority' | 'status' | 'assignee';
type TicketColumnFilters = Record<TicketColumn, readonly string[]>;
const NO_TICKET_COLUMN_FILTERS: TicketColumnFilters = { id: [], sender: [], topic: [], priority: [], status: [], assignee: [] };
const TICKET_UNASSIGNED = 'unassigned';

function ticketAssigneeKey(ticket: SupportTicket): string { return ticket.assignee?.trim() || TICKET_UNASSIGNED; }

function filterTickets(items: SupportTicket[], filters: TicketFilters, query: string, currentAssignee: string, now: number, columns: TicketColumnFilters = NO_TICKET_COLUMN_FILTERS): SupportTicket[] {
  const q = query.trim().toLocaleLowerCase('vi-VN');
  return items.filter(ticket => {
    const overdue = new Date(ticket.dueAt).getTime() < now && ticket.status !== 'closed';
    const created = ticket.createdAt.slice(0, 10);
    const assigneeOk = !filters.assignee || (filters.assignee === 'unassigned' ? !ticket.assignee : ticket.assignee === currentAssignee);
    const resolvedToday = !!ticket.resolvedAt && new Date(ticket.resolvedAt).toDateString() === new Date(now).toDateString();
    const resolvedWithin24Hours = !!ticket.resolvedAt && new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime() <= 24 * 3_600_000;
    const quickOk = !filters.quick || (filters.quick === 'unassigned' && ticket.status === 'unassigned') || (filters.quick === 'processing' && ['processing', 'waiting', 'reopened'].includes(ticket.status)) || (filters.quick === 'overdue' && overdue) || (filters.quick === 'resolvedToday' && resolvedToday) || (filters.quick === 'onTime' && resolvedWithin24Hours);
    const columnOk = (!columns.id.length || columns.id.includes(ticket.id)) && (!columns.sender.length || columns.sender.includes(ticket.learner)) && (!columns.topic.length || columns.topic.includes(ticket.topic)) && (!columns.priority.length || columns.priority.includes(ticket.priority)) && (!columns.status.length || columns.status.includes(ticket.status)) && (!columns.assignee.length || columns.assignee.includes(ticketAssigneeKey(ticket)));
    return (!q || [ticket.id, ticket.learner, ticket.email, ticket.summary].some(value => value.toLocaleLowerCase('vi-VN').includes(q))) && (!filters.topic || ticket.topic === filters.topic) && (!filters.priority || ticket.priority === filters.priority) && (!filters.status || (filters.status === 'overdue' ? overdue : ticket.status === filters.status)) && assigneeOk && (!filters.from || created >= filters.from) && (!filters.to || created <= filters.to) && quickOk && columnOk;
  }).sort((a, b) => a.status === 'reopened' && b.status !== 'reopened' ? -1 : b.status === 'reopened' && a.status !== 'reopened' ? 1 : (b.reopenedAt ?? b.createdAt).localeCompare(a.reopenedAt ?? a.createdAt));
}

@Component({ selector: 'app-support-tickets', standalone: true, imports: [DatePipe, SupportPaginationComponent, ColumnVisibilityComponent, ColumnFilterComponent, CustomSelectComponent, ExportMenuComponent, SearchFieldComponent, DateTimePickerComponent, SupportFilterModalComponent, TableColumnResizeDirective, SelectionBarComponent, BulkSelectionDialogComponent, AdminDialogComponent, LucideClock, LucideRefreshCw, LucideTriangleAlert, LucideCircleCheck, LucideGauge, LucidePaperclip, LucideEye, LucideFilter, LucideX], templateUrl: './tickets.component.html', styleUrls: ['../support-page.css', './tickets.component.css'] })
export class TicketsComponent {
  private readonly data = inject(SupportDemoService); private readonly router = inject(Router); private readonly auth = inject(AdminAuthService); private readonly destroyRef = inject(DestroyRef);
  private readonly pageSizeService = inject(AdminPageSizeService);
  readonly tickets = this.data.tickets; readonly queryInput = signal(''); readonly query = signal(''); readonly page = signal(1);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  private readonly columnFilters: Record<TicketColumn, WritableSignal<string[]>> = { id: signal<string[]>([]), sender: signal<string[]>([]), topic: signal<string[]>([]), priority: signal<string[]>([]), status: signal<string[]>([]), assignee: signal<string[]>([]) };
  private readonly columnFilterValues = computed<TicketColumnFilters>(() => ({ id: this.columnFilters.id(), sender: this.columnFilters.sender(), topic: this.columnFilters.topic(), priority: this.columnFilters.priority(), status: this.columnFilters.status(), assignee: this.columnFilters.assignee() }));
  readonly appliedFilters = signal<TicketFilters>({ ...EMPTY_TICKET_FILTERS }); readonly draftFilters = signal<TicketFilters>({ ...EMPTY_TICKET_FILTERS }); readonly filterOpen = signal(false);
  readonly learnerPreview = signal<SupportTicket | null>(null); readonly now = signal(Date.now()); private searchTimer?: ReturnType<typeof setTimeout>;
  readonly currentAssignee = computed(() => this.auth.currentUser()?.fullName || 'Minh Anh');
  readonly topicOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả chủ đề' }, ...SUPPORT_TOPICS.map(value => ({ value, label: value }))];
  readonly priorityOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'high', label: 'Cao' }, { value: 'medium', label: 'Trung bình' }, { value: 'low', label: 'Thấp' }];
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'unassigned', label: 'Chờ tiếp nhận' }, { value: 'processing', label: 'Đang xử lý' }, { value: 'waiting', label: 'Chờ người gửi phản hồi' }, { value: 'reopened', label: 'Cần xử lý tiếp' }, { value: 'overdue', label: 'Quá hạn' }, { value: 'closed', label: 'Đã đóng' }];
  readonly assigneeOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'unassigned', label: 'Chưa gán' }, { value: 'me', label: 'Gán cho tôi' }];
  readonly statusToolbarOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả trạng thái' }, ...this.statusOptions.slice(1)];
  readonly periodToolbarOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'all', label: 'Tất cả thời gian' },
    { value: 'today', label: 'Hôm nay' },
    { value: 'week', label: '7 ngày gần nhất' },
    { value: 'month', label: 'Tháng này' },
    { value: 'quarter', label: 'Quý này' },
    { value: 'year', label: 'Năm này' }
  ];
  readonly tableColumns: ReadonlyArray<TableColumnOption> = [{ id: 'select', label: 'Chọn dòng', required: true }, { id: 'id', label: 'Mã ticket', required: true }, { id: 'sender', label: 'Người gửi' }, { id: 'topic', label: 'Chủ đề' }, { id: 'content', label: 'Nội dung' }, { id: 'evidence', label: 'Minh chứng' }, { id: 'priority', label: 'Ưu tiên' }, { id: 'time', label: 'Thời gian' }, { id: 'status', label: 'Trạng thái' }, { id: 'sla', label: 'SLA' }, { id: 'assignee', label: 'Phụ trách' }, { id: 'action', label: 'Xử lý' }];
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly numberSorts = NUMBER_SORT_OPTIONS;
  readonly columnSort = signal<{ column: TicketColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly filtered = computed(() => {
    const items = filterTickets(this.tickets(), this.appliedFilters(), this.query(), this.currentAssignee(), this.now(), this.columnFilterValues());
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
  });
  readonly previewResults = computed(() => filterTickets(this.tickets(), this.draftFilters(), this.query(), this.currentAssignee(), this.now()));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize))); readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly activeFilterCount = computed(() => { const f = this.appliedFilters(); return [f.topic, f.priority, f.status, f.assignee, f.quick, f.from || f.to].filter(Boolean).length; });
  readonly filterChips = computed<FilterChip[]>(() => { const f = this.appliedFilters(); const chips: FilterChip[] = []; if (f.quick) chips.push({ key: 'quick', label: this.quickLabel(f.quick) }); if (f.topic) chips.push({ key: 'topic', label: f.topic }); if (f.priority) chips.push({ key: 'priority', label: `Ưu tiên: ${this.optionLabel(this.priorityOptions, f.priority)}` }); if (f.status) chips.push({ key: 'status', label: `Trạng thái: ${this.optionLabel(this.statusOptions, f.status)}` }); if (f.assignee) chips.push({ key: 'assignee', label: `Phụ trách: ${this.optionLabel(this.assigneeOptions, f.assignee)}` }); if (f.from || f.to) chips.push({ key: 'from', label: `Thời gian: ${this.shortDate(f.from) || '...'} – ${this.shortDate(f.to) || '...'}` }); return chips; });
  readonly unassigned = computed(() => this.tickets().filter(item => item.status === 'unassigned').length); readonly processing = computed(() => this.tickets().filter(item => ['processing', 'waiting', 'reopened'].includes(item.status)).length); readonly overdue = computed(() => this.tickets().filter(item => this.slaMs(item) < 0 && item.status !== 'closed').length); readonly resolvedToday = computed(() => this.tickets().filter(item => item.resolvedAt && new Date(item.resolvedAt).toDateString() === new Date(this.now()).toDateString()).length); readonly onTime = computed(() => { const all = this.tickets(); const count = all.filter(item => item.resolvedAt && new Date(item.resolvedAt).getTime() - new Date(item.createdAt).getTime() <= 24 * 3_600_000).length; return all.length ? Math.round(count / all.length * 1000) / 10 : 100; });

  readonly ticketIdValues = computed<ColumnFilterValue[]>(() => this.tickets().map(ticket => ({ value: ticket.id, label: ticket.id })));
  readonly senderValues = computed<ColumnFilterValue[]>(() => [...new Set(this.tickets().map(ticket => ticket.learner))].map(learner => ({ value: learner, label: learner })));
  readonly topicValues: readonly ColumnFilterValue[] = SUPPORT_TOPICS.map(topic => ({ value: topic, label: topic }));
  readonly priorityFilterValues: readonly ColumnFilterValue[] = [{ value: 'high', label: 'Cao' }, { value: 'medium', label: 'Trung bình' }, { value: 'low', label: 'Thấp' }];
  readonly statusFilterValues: readonly ColumnFilterValue[] = [{ value: 'unassigned', label: 'Chờ tiếp nhận' }, { value: 'processing', label: 'Đang xử lý' }, { value: 'waiting', label: 'Chờ phản hồi' }, { value: 'reopened', label: 'Cần xử lý tiếp' }, { value: 'closed', label: 'Đã đóng' }];
  readonly assigneeFilterValues = computed<ColumnFilterValue[]>(() => {
    const names = [...new Set(this.tickets().map(ticket => ticket.assignee?.trim() || TICKET_UNASSIGNED))].sort((a, b) => a.localeCompare(b, 'vi'));
    return names.map(name => ({ value: name, label: name === TICKET_UNASSIGNED ? 'Chưa gán' : name }));
  });

  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkCloseIds = signal<readonly string[] | null>(null);
  readonly toast = signal('');
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => { const items = this.visible(); const chosen = this.selection(); return items.length > 0 && items.every(item => chosen.has(item.id)); });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.tickets()
    .filter(ticket => this.selection().has(ticket.id))
    .map(ticket => ({ id: ticket.id, label: ticket.id, detail: `${ticket.learner} · ${this.statusLabel(ticket.status)}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(ticket => !this.selection().has(ticket.id))
    .map(ticket => ({ id: ticket.id, label: ticket.id, detail: `${ticket.learner} · ${this.statusLabel(ticket.status)}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => {
    const chosen = this.tickets().filter(ticket => this.selection().has(ticket.id));
    const closable = chosen.some(ticket => ticket.status !== 'closed');
    const reopenable = chosen.some(ticket => ticket.status === 'closed');
    return [
      { key: 'assign', label: 'Gán cho tôi', tone: 'primary', title: `Gán cho ${this.currentAssignee()}` },
      { key: 'close', label: 'Đóng ticket', disabled: !closable, title: closable ? '' : 'Các ticket đã chọn đều đã đóng' },
      { key: 'reopen', label: 'Mở lại', disabled: !reopenable, title: reopenable ? '' : 'Chỉ mở lại được ticket đã đóng' }
    ];
  });

  constructor() { const clock = setInterval(() => this.now.set(Date.now()), 60_000); this.destroyRef.onDestroy(() => clearInterval(clock)); }
  filterFor(key: TicketColumn): readonly string[] { return this.columnFilters[key](); }
  updateColumnFilter(key: TicketColumn, values: string[]): void { this.columnFilters[key].set(values); this.page.set(1); }
  sortFor(key: TicketColumn): string { const current = this.columnSort(); return current?.column === key ? current.direction : ''; }
  updateColumnSort(key: TicketColumn, direction: string): void { const current = this.columnSort(); this.columnSort.set(!direction || (current?.column === key && current.direction === direction) ? null : { column: key, direction: direction as 'asc' | 'desc' }); this.page.set(1); }
  private sortValue(ticket: SupportTicket, column: TicketColumn): string | number {
    switch (column) {
      case 'id': return ticket.id;
      case 'sender': return ticket.learner;
      case 'topic': return ticket.topic;
      case 'priority': return ticket.priority === 'high' ? 3 : ticket.priority === 'medium' ? 2 : 1;
      case 'status': return this.statusLabel(ticket.status);
      case 'assignee': return ticket.assignee?.trim() || 'Chưa gán';
    }
  }
  setSearch(value: string): void { this.queryInput.set(value); clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.query.set(value); this.page.set(1); }, 300); }
  openFilters(): void { this.draftFilters.set({ ...this.appliedFilters() }); this.filterOpen.set(true); }
  closeFilters(): void { this.draftFilters.set({ ...this.appliedFilters() }); this.filterOpen.set(false); }
  clearDraftFilters(): void { this.draftFilters.set({ ...EMPTY_TICKET_FILTERS }); }
  applyFilters(): void { this.appliedFilters.set({ ...this.draftFilters() }); this.page.set(1); this.filterOpen.set(false); }
  setDraft(key: keyof TicketFilters, value: string): void { this.draftFilters.update(filters => ({ ...filters, [key]: value, ...(key === 'status' ? { quick: '' } : {}) } as TicketFilters)); }
  selectDraftPeriod(period: FilterPeriod): void { this.draftFilters.update(filters => ({ ...filters, ...this.periodRange(period), period })); }
  setDraftDate(key: 'from' | 'to', value: string): void { this.draftFilters.update(filters => { const next = { ...filters, [key]: value, period: '' as FilterPeriod }; if (key === 'from' && next.to && value > next.to) next.to = value; if (key === 'to' && next.from && value < next.from) next.from = value; return next; }); }
  applyQuickFilter(quick: Exclude<TicketQuickFilter, ''>): void { const current = this.appliedFilters(); this.appliedFilters.set({ ...current, quick: current.quick === quick ? '' : quick, status: '' }); this.page.set(1); }
  removeFilterChip(key: keyof TicketFilters): void { this.appliedFilters.update(filters => key === 'from' ? { ...filters, from: '', to: '', period: 'all' } : { ...filters, [key]: '' } as TicketFilters); this.page.set(1); }
  reset(): void { this.queryInput.set(''); this.query.set(''); this.appliedFilters.set({ ...EMPTY_TICKET_FILTERS }); this.draftFilters.set({ ...EMPTY_TICKET_FILTERS }); (Object.keys(this.columnFilters) as TicketColumn[]).forEach(key => this.columnFilters[key].set([])); this.columnSort.set(null); this.page.set(1); this.clearSelection(); }
  setAppliedStatus(value: string): void { this.appliedFilters.update(filters => ({ ...filters, status: value as TicketFilters['status'], quick: '' })); this.page.set(1); }
  setAppliedPeriod(value: string): void { const period = value as FilterPeriod; this.appliedFilters.update(filters => ({ ...filters, ...this.periodRange(period), period })); this.page.set(1); }
  async export(format: ExportFormat): Promise<void> {
    const rows: (string | number)[][] = [
      ['Mã ticket', 'Người gửi', 'Email', 'Chủ đề', 'Ưu tiên', 'Thời gian tạo', 'Trạng thái', 'SLA', 'Phụ trách'],
      ...this.filtered().map(ticket => [
        ticket.id,
        ticket.learner,
        ticket.email,
        ticket.topic,
        ticket.priority === 'high' ? 'Cao' : ticket.priority === 'medium' ? 'Trung bình' : 'Thấp',
        ticket.createdAt,
        this.statusLabel(ticket.status),
        this.sla(ticket),
        ticket.assignee || 'Chưa gán'
      ])
    ];
    await downloadTable(format, 'thinkup-ticket-ho-tro', rows);
  }
  open(ticket: SupportTicket): void { void this.router.navigate(['/support/tickets', ticket.id]); }
  slaMs(ticket: SupportTicket): number { const end = ticket.status === 'closed' && ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : this.now(); return new Date(ticket.dueAt).getTime() - end; }
  sla(ticket: SupportTicket): string { const ms = this.slaMs(ticket), hours = Math.ceil(Math.abs(ms) / 3_600_000); if (ticket.status === 'closed') return ms < 0 ? `Đóng trễ ${hours} giờ` : `Đúng hạn ${hours} giờ`; return ms < 0 ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  statusLabel(status: TicketStatus): string { return ({ unassigned: 'Chờ tiếp nhận', processing: 'Đang xử lý', waiting: 'Chờ phản hồi', reopened: 'Cần xử lý tiếp', closed: 'Đã đóng' })[status]; }
  attachmentTitle(ticket: SupportTicket): string { return ticket.attachments.length ? ticket.attachments.map(file => file.name).join('\n') : 'Không có tệp'; }
  pageTo(value: number): void { this.page.set(Math.max(1, Math.min(this.pages(), value))); }
  isSelected(id: string): boolean { return this.selection().has(id); }
  toggleSelect(id: string, checked: boolean): void { const next = new Set(this.selection()); if (checked) next.add(id); else next.delete(id); this.selection.set(next); }
  toggleSelectAll(): void { const next = new Set(this.selection()); if (this.allVisibleSelected()) this.visible().forEach(ticket => next.delete(ticket.id)); else this.visible().forEach(ticket => next.add(ticket.id)); this.selection.set(next); }
  clearSelection(): void { this.selection.set(new Set()); }
  setSelectionIds(ids: string[]): void { this.selection.set(new Set(ids)); }
  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    const targets = ids ?? this.selectedIds();
    if (!targets.length) return;
    if (key === 'assign') {
      targets.forEach(id => this.data.assignTicket(id, this.currentAssignee(), 'Gán hàng loạt từ hàng đợi ticket.'));
      this.clearSelection();
      this.notify(`Đã gán ${targets.length} ticket cho ${this.currentAssignee()}.`);
    } else if (key === 'close') {
      this.bulkCloseIds.set(targets);
    } else if (key === 'reopen') {
      const closed = this.tickets().filter(ticket => targets.includes(ticket.id) && ticket.status === 'closed');
      if (!closed.length) { this.notify('Các ticket đã chọn đều chưa đóng.'); return; }
      closed.forEach(ticket => this.data.reopenTicket(ticket.id));
      this.clearSelection();
      this.notify(`Đã mở lại ${closed.length} ticket.`);
    }
  }
  confirmBulkClose(): void {
    const ids = this.bulkCloseIds();
    if (!ids?.length) return;
    const targets = this.tickets().filter(ticket => ids.includes(ticket.id) && ticket.status !== 'closed');
    this.bulkCloseIds.set(null);
    if (!targets.length) { this.notify('Các ticket đã chọn đều đã đóng.'); return; }
    targets.forEach(ticket => this.data.resolveTicket(ticket.id, 'Ticket được đóng hàng loạt từ hàng đợi hỗ trợ. Nếu cần hỗ trợ thêm, vui lòng mở lại ticket.', 'other', 'Đóng hàng loạt bởi quản trị viên.', false));
    this.clearSelection();
    this.notify(`Đã đóng ${targets.length} ticket.`);
  }
  notify(message: string): void { this.toast.set(message); setTimeout(() => { if (this.toast() === message) this.toast.set(''); }, 3500); }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  private optionLabel(options: ReadonlyArray<CustomSelectOption>, value: string): string { return options.find(option => option.value === value)?.label ?? value; }
  private quickLabel(value: TicketQuickFilter): string { return ({ unassigned: 'Chờ tiếp nhận', processing: 'Đang xử lý', overdue: 'Quá hạn SLA', resolvedToday: 'Đã giải quyết hôm nay', onTime: 'Đúng hạn SLA', '': '' })[value]; }
  private periodRange(value: FilterPeriod): { from: string; to: string } { const now = new Date(), iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; if (value === 'today') return { from: iso(now), to: iso(now) }; if (value === 'week') { const start = new Date(now); start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; } if (value === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }; if (value === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: iso(now) }; if (value === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }; return { from: '', to: '' }; }
  @HostListener('document:keydown.escape') closePreview(): void { if (this.learnerPreview()) this.learnerPreview.set(null); }
}
