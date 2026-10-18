import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BusinessOrder, OrderStatus } from '../models/business.models';
import { BusinessDemoService } from '../services/business-demo.service';
import { dateTime, downloadCsv, matchesDates, money } from '../business-utils';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent {
  // TODO(pre-deploy): Nhớ xóa dữ liệu minh họa sau khi service đơn hàng dùng API chính thức; kết nối thanh toán và hóa đơn qua backend.
  private readonly data = inject(BusinessDemoService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private detailTrigger: HTMLElement | null = null;
  private readonly repositionDatePopover = () => this.positionDatePopover();
  readonly money = money;
  readonly search = signal('');
  readonly status = signal<OrderStatus | ''>('');
  readonly method = signal('');
  readonly from = signal(this.monthStart());
  readonly to = signal(this.today());
  readonly dateOpen = signal(false);
  readonly datePopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null);
  readonly sort = signal<'newest' | 'oldest'>('newest');
  readonly page = signal(1);
  readonly selected = signal<BusinessOrder | null>(null);
  readonly methods = ['Thẻ ATM / nội địa', 'Ví điện tử', 'Chuyển khoản ngân hàng', 'QR Code', 'Thẻ tín dụng / ghi nợ quốc tế', 'PayPal', 'Apple Pay / Google Pay', 'Chuyển khoản quốc tế'];
  readonly orders = this.data.orders;
  readonly filtered = computed(() => this.orders().filter(order => {
    const query = this.search().trim().toLocaleLowerCase('vi-VN');
    return (!query || [order.id, order.transactionId ?? '', order.learner, order.email].some(value => value.toLocaleLowerCase('vi-VN').includes(query)))
      && (!this.status() || order.status === this.status())
      && (!this.method() || this.methodMatches(order.method, this.method()))
      && matchesDates(order.createdAt, this.from(), this.to());
  }).sort((a, b) => this.sort() === 'newest'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.createdAt.localeCompare(b.createdAt)));
  readonly pageSize = 8;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pageNumbers = computed(() => Array.from({ length: Math.min(this.pages(), 5) }, (_, index) => index + 1));
  readonly dateLabel = computed(() => this.from() || this.to()
    ? `${this.shortDate(this.from()) || '...'} - ${this.shortDate(this.to()) || '...'}`
    : 'Toàn bộ thời gian');
  readonly total = computed(() => this.orders().length);
  readonly success = computed(() => this.orders().filter(order => order.status === 'success').length);
  readonly pending = computed(() => this.orders().filter(order => order.status === 'pending').length);
  readonly cancelled = computed(() => this.orders().filter(order => order.status === 'cancelled').length);

  constructor() {
    this.destroyRef.onDestroy(() => this.removeDatePopoverListeners());
  }

  toggleDatePopover(): void {
    if (this.dateOpen()) { this.closeDatePopover(); return; }
    this.datePopoverPosition.set(null);
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
  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setFrom(value: string): void { this.from.set(value); this.page.set(1); }
  setTo(value: string): void { this.to.set(value); this.page.set(1); }
  toggleSort(): void { this.sort.update(value => value === 'newest' ? 'oldest' : 'newest'); this.page.set(1); }
  private today(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  private monthStart(): string { return `${this.today().slice(0, 7)}-01`; }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  timeOf(value: string): string { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  dateOf(value: string): string { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  dateTimeWithSeconds(value: string): string {
    const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
    return `${this.dateOf(value)}, ${time}`;
  }
  setPeriod(value: string): void {
    const now = new Date();
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (value === 'all') { this.from.set(''); this.to.set(''); }
    if (value === 'today') { this.from.set(iso(now)); this.to.set(iso(now)); }
    if (value === 'week') { const start = new Date(now); start.setDate(now.getDate() - 6); this.from.set(iso(start)); this.to.set(iso(now)); }
    if (value === 'month') { this.from.set(iso(new Date(now.getFullYear(), now.getMonth(), 1))); this.to.set(iso(now)); }
    if (value === 'quarter') { this.from.set(iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1))); this.to.set(iso(now)); }
    if (value === 'year') { this.from.set(iso(new Date(now.getFullYear(), 0, 1))); this.to.set(iso(now)); }
    this.page.set(1);
    this.closeDatePopover();
  }
  clear(): void { this.search.set(''); this.status.set(''); this.method.set(''); this.from.set(''); this.to.set(''); this.sort.set('newest'); this.page.set(1); this.closeDatePopover(); }
  export(): void {
    downloadCsv('thinkup-don-hang.csv', [
      ['Mã đơn', 'Mã giao dịch', 'Học viên', 'Email', 'Khóa học', 'Thực thu', 'Phương thức', 'Trạng thái', 'Ngày tạo'],
      ...this.filtered().map(order => [order.id, order.transactionId ?? '', order.learner, order.email, order.courses.join('; '), order.originalAmount - order.discount, order.method, this.statusLabel(order.status), dateTime(order.createdAt)])
    ]);
  }
  methodMatches(actual: string, filter: string): boolean {
    return filter === 'Ví điện tử' ? actual === 'MoMo' : actual === filter;
  }
  statusLabel(status: OrderStatus): string { return { success: 'Thành công', pending: 'Chờ thanh toán', cancelled: 'Đã hủy' }[status]; }
  statusIcon(status: OrderStatus): string { return { success: 'circle-check.svg', pending: 'hourglass.svg', cancelled: 'circle-x.svg' }[status]; }
  displayId(order: BusinessOrder): string { return order.status === 'success' ? order.transactionId ?? order.id : order.id; }
  openDetail(order: BusinessOrder, event: Event): void {
    this.detailTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selected.set(order);
    setTimeout(() => this.document.getElementById('order-detail-close')?.focus());
  }
  closeDetail(): void {
    this.selected.set(null);
    setTimeout(() => this.detailTrigger?.focus());
  }
  instructorBase(order: BusinessOrder): number { return order.originalAmount - (order.sponsor === 'instructor' ? order.discount : 0); }
  instructorShare(order: BusinessOrder): number { return Math.round(this.instructorBase(order) * 0.4); }
  platformShare(order: BusinessOrder): number { return order.originalAmount - order.discount - this.instructorShare(order); }
}
