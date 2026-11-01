import { DatePipe } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideCircleCheck, LucideClock, LucideEye, LucideFileText, LucideGauge, LucideImage, LucideMessagesSquare, LucidePaperclip, LucideRefreshCw, LucideSearch, LucideSmile, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { FAQ_CATEGORIES, SUPPORT_TOPICS } from '../../../core/data/mock/support.mock';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { Priority, SupportTicket, TicketStatus } from '../models/support.models';
import { SupportDemoService } from '../services/support-demo.service';
import { SupportPaginationComponent } from '../components/support-pagination/support-pagination.component';

@Component({ selector: 'app-support-tickets', standalone: true, imports: [FormsModule, DatePipe, SupportPaginationComponent, CustomSelectComponent, DateTimePickerComponent, LucideClock, LucideRefreshCw, LucideTriangleAlert, LucideCircleCheck, LucideGauge, LucideSearch, LucidePaperclip, LucideImage, LucideFileText, LucideSmile, LucideMessagesSquare, LucideEye, LucideX], templateUrl: './tickets.component.html', styleUrls: ['../support-page.css', './tickets.component.css'] })
export class TicketsComponent {
  private readonly data = inject(SupportDemoService); private readonly router = inject(Router);
  private readonly auth = inject(AdminAuthService); private readonly document = inject(DOCUMENT); private readonly destroyRef = inject(DestroyRef);
  readonly topics = SUPPORT_TOPICS; readonly faqCategories = FAQ_CATEGORIES; readonly tickets = this.data.tickets; readonly staff = this.data.staff;
  readonly queryInput = signal(''); readonly query = signal(''); readonly topic = signal(''); readonly priority = signal<Priority | ''>(''); readonly status = signal<TicketStatus | 'overdue' | ''>(''); readonly assignee = signal(''); readonly page = signal(1); readonly pageSize = 8;
  readonly from = signal(''); readonly to = signal(''); readonly fromDraft = signal(''); readonly toDraft = signal(''); readonly activePeriod = signal<'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | ''>('all'); readonly periodDraft = signal<'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | ''>('all');
  readonly dateOpen = signal(false); readonly datePopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null); readonly learnerPreview = signal<SupportTicket | null>(null);
  readonly selected = signal<SupportTicket | null>(null); readonly overlay = signal<'assign' | 'escalate' | 'close' | 'templates' | null>(null); readonly reply = signal(''); readonly note = signal(''); readonly selectedStaff = signal(''); readonly grounds = signal(''); readonly closeResult = signal(''); readonly toast = signal(''); readonly lightbox = signal<string | null>(null);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private readonly repositionDatePopover = () => this.positionDatePopover();
  readonly topicOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả chủ đề' }, ...this.topics.map(item => ({ value: item, label: item }))];
  readonly priorityOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'high', label: 'Cao' }, { value: 'medium', label: 'Trung bình' }, { value: 'low', label: 'Thấp' }];
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'unassigned', label: 'Chờ tiếp nhận' }, { value: 'processing', label: 'Đang xử lý' }, { value: 'waiting', label: 'Chờ học viên phản hồi' }, { value: 'reopened', label: 'Cần xử lý tiếp' }, { value: 'overdue', label: 'Quá hạn' }, { value: 'closed', label: 'Đã đóng' }];
  readonly assigneeOptions: ReadonlyArray<CustomSelectOption> = [{ value: '', label: 'Tất cả' }, { value: 'unassigned', label: 'Chưa gán' }, { value: 'me', label: 'Gán cho tôi' }];
  readonly currentAssignee = computed(() => this.auth.currentUser()?.fullName || 'Minh Anh');
  readonly filtered = computed(() => this.tickets().filter(ticket => {
    const q = this.query().trim().toLocaleLowerCase('vi-VN'); const overdue = new Date(ticket.dueAt).getTime() < Date.now() && ticket.status !== 'closed';
    const created = ticket.createdAt.slice(0, 10); const periodOk = (!this.from() || created >= this.from()) && (!this.to() || created <= this.to());
    const assigneeOk = !this.assignee() || (this.assignee() === 'unassigned' ? !ticket.assignee : ticket.assignee === this.currentAssignee());
    return (!q || [ticket.id, ticket.learner, ticket.email, ticket.summary].some(value => value.toLocaleLowerCase('vi-VN').includes(q))) && (!this.topic() || ticket.topic === this.topic()) && (!this.priority() || ticket.priority === this.priority()) && (!this.status() || (this.status() === 'overdue' ? overdue : ticket.status === this.status())) && assigneeOk && periodOk;
  }).sort((a, b) => {
    if (a.status === 'reopened' && b.status !== 'reopened') return -1;
    if (b.status === 'reopened' && a.status !== 'reopened') return 1;
    return (b.reopenedAt ?? b.createdAt).localeCompare(a.reopenedAt ?? a.createdAt);
  }));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize))); readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly unassigned = computed(() => this.tickets().filter(item => item.status === 'unassigned').length); readonly processing = computed(() => this.tickets().filter(item => ['processing', 'waiting', 'reopened'].includes(item.status)).length); readonly overdue = computed(() => this.tickets().filter(item => this.slaMs(item) < 0 && item.status !== 'closed').length); readonly resolvedToday = computed(() => this.tickets().filter(item => item.resolvedAt && new Date(item.resolvedAt).toDateString() === new Date().toDateString()).length); readonly onTime = computed(() => { const closed = this.tickets().filter(item => item.status === 'closed'); return closed.length ? Math.round(closed.filter(item => item.resolvedAt && new Date(item.resolvedAt) <= new Date(item.dueAt)).length / closed.length * 100) : 100; });
  setSearch(value: string): void { this.queryInput.set(value); clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.query.set(value); this.page.set(1); }, 300); }
  reset(): void { this.queryInput.set(''); this.query.set(''); this.topic.set(''); this.priority.set(''); this.status.set(''); this.assignee.set(''); this.clearDateRange(); this.page.set(1); this.closeDatePopover(); }
  open(ticket: SupportTicket): void { void this.router.navigate(['/support/tickets', ticket.id]); }
  closeDrawer(): void { this.selected.set(null); this.overlay.set(null); }
  slaMs(ticket: SupportTicket): number { return new Date(ticket.dueAt).getTime() - Date.now(); }
  sla(ticket: SupportTicket): string { const ms = this.slaMs(ticket); const hours = Math.ceil(Math.abs(ms) / 3_600_000); return ms < 0 ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  send(close: boolean): void { const ticket = this.selected(); const body = this.reply().trim(); if (!ticket || body.length < 3) return; if (close) { this.closeResult.set(body); this.overlay.set('close'); return; } this.data.reply(ticket.id, body, 'waiting'); this.reply.set(''); this.refresh(ticket.id); this.notify('Phản hồi đã được xếp hàng gửi; ticket vẫn mở.'); }
  confirmClose(): void { const ticket = this.selected(); if (!ticket || this.closeResult().trim().length < 10) return; this.data.resolveTicket(ticket.id, this.closeResult().trim(), 'code_guidance', '', true); this.notify('Đã lưu kết quả đóng ticket trong adapter; chờ backend đồng bộ email.'); this.closeDrawer(); }
  confirmAssign(): void { const ticket = this.selected(); if (!ticket || !this.selectedStaff() || this.note().trim().length < 10) return; this.data.assignTicket(ticket.id, this.selectedStaff(), this.note().trim()); this.overlay.set(null); this.refresh(ticket.id); this.notify('Đã điều chuyển và giữ nguyên SLA gốc.'); }
  confirmEscalate(): void { const ticket = this.selected(); if (!ticket || this.grounds().trim().length < 20) return; const id = this.data.escalateTicket(ticket.id, this.grounds().trim(), 'Khiếu nại cần phân loại'); this.closeDrawer(); this.router.navigate(['/support/complaints'], { queryParams: { case: id } }); }
  useTemplate(value: string): void { this.reply.set(value); this.overlay.set(null); }
  refresh(id: string): void { this.selected.set(this.tickets().find(item => item.id === id) ?? null); }
  notify(message: string): void { this.toast.set(message); setTimeout(() => this.toast.set(''), 3500); }
  pageTo(value: number): void { this.page.set(Math.max(1, Math.min(this.pages(), value))); }
  readonly dateLabel = computed(() => this.from() || this.to() ? `${this.shortDate(this.from()) || '...'} - ${this.shortDate(this.to()) || '...'}` : 'Tất cả');
  readonly canClearDateRange = computed(() => !!(this.from() || this.to() || this.fromDraft() || this.toDraft()));
  constructor() { this.destroyRef.onDestroy(() => this.removeDatePopoverListeners()); }
  setFilter(target: 'topic' | 'priority' | 'status' | 'assignee', value: string): void { if (target === 'topic') this.topic.set(value); if (target === 'priority') this.priority.set(value as Priority | ''); if (target === 'status') this.status.set(value as TicketStatus | 'overdue' | ''); if (target === 'assignee') this.assignee.set(value); this.page.set(1); }
  toggleDatePopover(): void { if (this.dateOpen()) { this.closeDatePopover(); return; } this.fromDraft.set(this.from()); this.toDraft.set(this.to()); this.periodDraft.set(this.activePeriod()); this.datePopoverPosition.set(null); this.dateOpen.set(true); const view = this.document.defaultView; view?.addEventListener('resize', this.repositionDatePopover); view?.addEventListener('scroll', this.repositionDatePopover, true); setTimeout(() => this.positionDatePopover()); }
  closeDatePopover(): void { this.dateOpen.set(false); this.datePopoverPosition.set(null); this.removeDatePopoverListeners(); }
  private removeDatePopoverListeners(): void { const view = this.document.defaultView; view?.removeEventListener('resize', this.repositionDatePopover); view?.removeEventListener('scroll', this.repositionDatePopover, true); }
  private positionDatePopover(): void { if (!this.dateOpen()) return; const view = this.document.defaultView; const trigger = this.document.querySelector<HTMLElement>('.ticket-date-trigger'); const popover = this.document.getElementById('ticket-date-options'); if (!view || !trigger || !popover) return; const margin = 12; const gap = 8; const rect = trigger.getBoundingClientRect(); const popup = popover.getBoundingClientRect(); const width = Math.min(popup.width, view.innerWidth - margin * 2); const left = Math.max(margin, Math.min(rect.left, view.innerWidth - margin - width)); const below = view.innerHeight - rect.bottom - gap - margin; const above = rect.top - gap - margin; const openAbove = below < popup.height && above > below; const maxHeight = Math.max(0, openAbove ? above : below); const top = openAbove ? Math.max(margin, rect.top - gap - Math.min(popup.height, maxHeight)) : rect.bottom + gap; this.datePopoverPosition.set({ left, top, maxHeight }); }
  selectFrom(value: string): void { this.fromDraft.set(value); if (this.toDraft() && value > this.toDraft()) this.toDraft.set(value); this.periodDraft.set(''); }
  selectTo(value: string): void { this.toDraft.set(value); if (this.fromDraft() && value < this.fromDraft()) this.fromDraft.set(value); this.periodDraft.set(''); }
  selectPeriod(value: string): void { const range = this.periodRange(value); this.fromDraft.set(range.from); this.toDraft.set(range.to); this.periodDraft.set(value as 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | ''); }
  applyDateRange(): void { this.from.set(this.fromDraft()); this.to.set(this.toDraft()); this.activePeriod.set(this.periodDraft()); this.page.set(1); this.closeDatePopover(); }
  clearDateRange(): void { this.from.set(''); this.to.set(''); this.fromDraft.set(''); this.toDraft.set(''); this.activePeriod.set('all'); this.periodDraft.set('all'); this.page.set(1); }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  private periodRange(value: string): { from: string; to: string } { const now = new Date(); const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; if (value === 'today') return { from: iso(now), to: iso(now) }; if (value === 'week') { const start = new Date(now); start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; } if (value === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }; if (value === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: iso(now) }; if (value === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }; return { from: '', to: '' }; }
  @HostListener('document:keydown.escape') onEscape(): void { if (this.learnerPreview()) this.learnerPreview.set(null); else if (this.dateOpen()) this.closeDatePopover(); else if (this.lightbox()) this.lightbox.set(null); else if (this.overlay()) this.overlay.set(null); else if (this.selected()) this.closeDrawer(); }
}
