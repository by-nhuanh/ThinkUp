import { DatePipe } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideCircleCheck, LucideClock, LucideEye, LucideFilter, LucideGauge, LucidePaperclip, LucideRefreshCw, LucideSearch, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { SUPPORT_TOPICS } from '../../../core/data/mock/support.mock';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { ColumnVisibilityComponent, TableColumnOption } from '../../../shared/components/column-visibility/column-visibility.component';
import { CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
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

function filterTickets(items: SupportTicket[], filters: TicketFilters, query: string, currentAssignee: string, now: number): SupportTicket[] {
  const q = query.trim().toLocaleLowerCase('vi-VN');
  return items.filter(ticket => {
    const overdue = new Date(ticket.dueAt).getTime() < now && ticket.status !== 'closed';
    const created = ticket.createdAt.slice(0, 10);
    const assigneeOk = !filters.assignee || (filters.assignee === 'unassigned' ? !ticket.assignee : ticket.assignee === currentAssignee);
    const resolvedToday = !!ticket.resolvedAt && new Date(ticket.resolvedAt).toDateString() === new Date(now).toDateString();
    const resolvedWithin24Hours = !!ticket.resolvedAt && new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime() <= 24 * 3_600_000;
    const quickOk = !filters.quick || (filters.quick === 'unassigned' && ticket.status === 'unassigned') || (filters.quick === 'processing' && ['processing', 'waiting', 'reopened'].includes(ticket.status)) || (filters.quick === 'overdue' && overdue) || (filters.quick === 'resolvedToday' && resolvedToday) || (filters.quick === 'onTime' && resolvedWithin24Hours);
    return (!q || [ticket.id, ticket.learner, ticket.email, ticket.summary].some(value => value.toLocaleLowerCase('vi-VN').includes(q))) && (!filters.topic || ticket.topic === filters.topic) && (!filters.priority || ticket.priority === filters.priority) && (!filters.status || (filters.status === 'overdue' ? overdue : ticket.status === filters.status)) && assigneeOk && (!filters.from || created >= filters.from) && (!filters.to || created <= filters.to) && quickOk;
  }).sort((a, b) => a.status === 'reopened' && b.status !== 'reopened' ? -1 : b.status === 'reopened' && a.status !== 'reopened' ? 1 : (b.reopenedAt ?? b.createdAt).localeCompare(a.reopenedAt ?? a.createdAt));
}

@Component({ selector: 'app-support-tickets', standalone: true, imports: [FormsModule, DatePipe, SupportPaginationComponent, ColumnVisibilityComponent, DateTimePickerComponent, SupportFilterModalComponent, TableColumnResizeDirective, LucideClock, LucideRefreshCw, LucideTriangleAlert, LucideCircleCheck, LucideGauge, LucideSearch, LucidePaperclip, LucideEye, LucideFilter, LucideX], templateUrl: './tickets.component.html', styleUrls: ['../support-page.css', './tickets.component.css'] })
export class TicketsComponent {
  private readonly data = inject(SupportDemoService); private readonly router = inject(Router); private readonly auth = inject(AdminAuthService); private readonly destroyRef = inject(DestroyRef);
  readonly tickets = this.data.tickets; readonly queryInput = signal(''); readonly query = signal(''); readonly page = signal(1); readonly pageSize = 6;
  readonly appliedFilters = signal<TicketFilters>({ ...EMPTY_TICKET_FILTERS }); readonly draftFilters = signal<TicketFilters>({ ...EMPTY_TICKET_FILTERS }); readonly filterOpen = signal(false);
  readonly learnerPreview = signal<SupportTicket | null>(null); readonly now = signal(Date.now()); private searchTimer?: ReturnType<typeof setTimeout>;
  readonly currentAssignee = computed(() => this.auth.currentUser()?.fullName || 'Minh Anh');
  readonly topicOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả chủ đề' }, ...SUPPORT_TOPICS.map(value => ({ value, label: value }))];
  readonly priorityOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'high', label: 'Cao' }, { value: 'medium', label: 'Trung bình' }, { value: 'low', label: 'Thấp' }];
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'unassigned', label: 'Chờ tiếp nhận' }, { value: 'processing', label: 'Đang xử lý' }, { value: 'waiting', label: 'Chờ người gửi phản hồi' }, { value: 'reopened', label: 'Cần xử lý tiếp' }, { value: 'overdue', label: 'Quá hạn' }, { value: 'closed', label: 'Đã đóng' }];
  readonly assigneeOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'unassigned', label: 'Chưa gán' }, { value: 'me', label: 'Gán cho tôi' }];
  readonly tableColumns: ReadonlyArray<TableColumnOption> = [{ id: 'id', label: 'Mã ticket', required: true }, { id: 'sender', label: 'Người gửi' }, { id: 'topic', label: 'Chủ đề' }, { id: 'content', label: 'Nội dung' }, { id: 'evidence', label: 'Minh chứng' }, { id: 'priority', label: 'Ưu tiên' }, { id: 'time', label: 'Thời gian' }, { id: 'status', label: 'Trạng thái' }, { id: 'sla', label: 'SLA' }, { id: 'assignee', label: 'Phụ trách' }, { id: 'action', label: 'Xử lý' }];
  readonly filtered = computed(() => filterTickets(this.tickets(), this.appliedFilters(), this.query(), this.currentAssignee(), this.now()));
  readonly previewResults = computed(() => filterTickets(this.tickets(), this.draftFilters(), this.query(), this.currentAssignee(), this.now()));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize))); readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly activeFilterCount = computed(() => { const f = this.appliedFilters(); return [f.topic, f.priority, f.status, f.assignee, f.quick, f.from || f.to].filter(Boolean).length; });
  readonly filterChips = computed<FilterChip[]>(() => { const f = this.appliedFilters(); const chips: FilterChip[] = []; if (f.quick) chips.push({ key: 'quick', label: this.quickLabel(f.quick) }); if (f.topic) chips.push({ key: 'topic', label: f.topic }); if (f.priority) chips.push({ key: 'priority', label: `Ưu tiên: ${this.optionLabel(this.priorityOptions, f.priority)}` }); if (f.status) chips.push({ key: 'status', label: `Trạng thái: ${this.optionLabel(this.statusOptions, f.status)}` }); if (f.assignee) chips.push({ key: 'assignee', label: `Phụ trách: ${this.optionLabel(this.assigneeOptions, f.assignee)}` }); if (f.from || f.to) chips.push({ key: 'from', label: `Thời gian: ${this.shortDate(f.from) || '...'} – ${this.shortDate(f.to) || '...'}` }); return chips; });
  readonly unassigned = computed(() => this.tickets().filter(item => item.status === 'unassigned').length); readonly processing = computed(() => this.tickets().filter(item => ['processing', 'waiting', 'reopened'].includes(item.status)).length); readonly overdue = computed(() => this.tickets().filter(item => this.slaMs(item) < 0 && item.status !== 'closed').length); readonly resolvedToday = computed(() => this.tickets().filter(item => item.resolvedAt && new Date(item.resolvedAt).toDateString() === new Date(this.now()).toDateString()).length); readonly onTime = computed(() => { const all = this.tickets(); const count = all.filter(item => item.resolvedAt && new Date(item.resolvedAt).getTime() - new Date(item.createdAt).getTime() <= 24 * 3_600_000).length; return all.length ? Math.round(count / all.length * 1000) / 10 : 100; });

  constructor() { const clock = setInterval(() => this.now.set(Date.now()), 60_000); this.destroyRef.onDestroy(() => clearInterval(clock)); }
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
  reset(): void { this.queryInput.set(''); this.query.set(''); this.appliedFilters.set({ ...EMPTY_TICKET_FILTERS }); this.draftFilters.set({ ...EMPTY_TICKET_FILTERS }); this.page.set(1); }
  open(ticket: SupportTicket): void { void this.router.navigate(['/support/tickets', ticket.id]); }
  slaMs(ticket: SupportTicket): number { const end = ticket.status === 'closed' && ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : this.now(); return new Date(ticket.dueAt).getTime() - end; }
  sla(ticket: SupportTicket): string { const ms = this.slaMs(ticket), hours = Math.ceil(Math.abs(ms) / 3_600_000); if (ticket.status === 'closed') return ms < 0 ? `Đóng trễ ${hours} giờ` : `Đúng hạn ${hours} giờ`; return ms < 0 ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  statusLabel(status: TicketStatus): string { return ({ unassigned: 'Chờ tiếp nhận', processing: 'Đang xử lý', waiting: 'Chờ phản hồi', reopened: 'Cần xử lý tiếp', closed: 'Đã đóng' })[status]; }
  attachmentTitle(ticket: SupportTicket): string { return ticket.attachments.length ? ticket.attachments.map(file => file.name).join('\n') : 'Không có tệp'; }
  pageTo(value: number): void { this.page.set(Math.max(1, Math.min(this.pages(), value))); }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  private optionLabel(options: ReadonlyArray<CustomSelectOption>, value: string): string { return options.find(option => option.value === value)?.label ?? value; }
  private quickLabel(value: TicketQuickFilter): string { return ({ unassigned: 'Chờ tiếp nhận', processing: 'Đang xử lý', overdue: 'Quá hạn SLA', resolvedToday: 'Đã giải quyết hôm nay', onTime: 'Đúng hạn SLA', '': '' })[value]; }
  private periodRange(value: FilterPeriod): { from: string; to: string } { const now = new Date(), iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; if (value === 'today') return { from: iso(now), to: iso(now) }; if (value === 'week') { const start = new Date(now); start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; } if (value === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }; if (value === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: iso(now) }; if (value === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }; return { from: '', to: '' }; }
  @HostListener('document:keydown.escape') closePreview(): void { if (this.learnerPreview()) this.learnerPreview.set(null); }
}
