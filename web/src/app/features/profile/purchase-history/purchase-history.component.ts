import { Component, DestroyRef, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCalendarDays, LucideChevronDown } from '@lucide/angular';
import { TransactionRow } from '../../../core/models/commerce.model';
import { PurchaseHistoryService } from '../services/purchase-history.service';
import { DateCalendarComponent } from './components/date-calendar/date-calendar.component';
import { Subscription, forkJoin } from 'rxjs';

type StatusFilter = 'all' | 'success' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'needs_review';

@Component({
  selector: 'app-purchase-history',
  standalone: true,
  imports: [RouterLink, LucideCalendarDays, LucideChevronDown, DateCalendarComponent],
  templateUrl: './purchase-history.component.html',
  styleUrl: './purchase-history.component.css',
})
export class PurchaseHistoryComponent implements OnInit {
  private readonly purchaseHistory = inject(PurchaseHistoryService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly transactions = signal<TransactionRow[]>([]);
  readonly totalTransactions = signal(0);
  readonly totalSpent = signal(0);
  readonly totalCoursesPurchased = signal(0);
  readonly query = signal('');
  readonly selectedStatus = signal<StatusFilter>('all');
  readonly selectedDate = signal('Tất cả thời gian');
  readonly statusOpen = signal(false);
  readonly dateOpen = signal(false);
  readonly customRangeOpen = signal(false);
  readonly activeCalendar = signal<'from' | 'to' | null>(null);
  readonly sortAscending = signal(false);
  readonly page = signal(1);
  readonly pageSize = 5;
  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'success', label: 'Thành công' },
    { value: 'pending', label: 'Đang xử lý' },
    { value: 'failed', label: 'Thất bại' },
    { value: 'cancelled', label: 'Đã hủy' },
    { value: 'paid', label: 'Đã nhận tiền, chờ cấp quyền' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'needs_review', label: 'Cần đối soát' },
  ];
  readonly datePresets = ['Hôm nay', 'Hôm qua', '7 ngày qua', '30 ngày qua', 'Tháng này', 'Tháng trước', 'Tùy chọn khác'];
  readonly customFrom = signal('');
  readonly customTo = signal('');
  readonly appliedCustomRange = signal<{ from: string; to: string } | null>(null);
  readonly invalidRange = computed(() => !!this.customFrom() && !!this.customTo() && this.customFrom() > this.customTo());
  readonly dateButtonLabel = computed(() => {
    const range = this.appliedCustomRange();
    return this.selectedDate() === 'Tùy chọn khác' && range
      ? `${this.formatDisplayDate(range.from)} - ${this.formatDisplayDate(range.to)}`
      : this.selectedDate();
  });
  readonly spending = computed(() => `${new Intl.NumberFormat('vi-VN').format(this.totalSpent())}đ`);
  readonly filtered = computed(() => {
    return [...this.transactions()].sort((a, b) => (this.sortAscending() ? 1 : -1) * (this.dateOf(a).getTime() - this.dateOf(b).getTime()));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((Math.min(this.page(), this.pageCount()) - 1) * this.pageSize, Math.min(this.page(), this.pageCount()) * this.pageSize));
  readonly visibleStart = computed(() => this.filtered().length ? (Math.min(this.page(), this.pageCount()) - 1) * this.pageSize + 1 : 0);
  readonly visibleEnd = computed(() => Math.min(Math.min(this.page(), this.pageCount()) * this.pageSize, this.filtered().length));
  readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_, index) => index + 1));

  ngOnInit(): void { this.destroyRef.onDestroy(() => this.request?.unsubscribe()); this.load(); }

  statusLabelFor(status: string): string {
    switch (status) {
      case 'success': return 'Thành công';
      case 'pending': return 'Đang xử lý';
      case 'failed': return 'Thất bại';
      case 'cancelled': return 'Đã hủy';
      case 'paid': return 'Đã nhận tiền, chờ cấp quyền';
      case 'expired': return 'Hết hạn';
      case 'needs_review': return 'Cần đối soát';
      default: return status || 'Không rõ';
    }
  }

  statusClassFor(status: string): string {
    if (status === 'success') return 'border-[#BEEFD9] bg-[#E9FBF2] text-[#00A66E]';
    if (status === 'pending' || status === 'paid') return 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]';
    if (status === 'needs_review') return 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]';
    if (status === 'cancelled') return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]';
    return 'border-[#FFD1DC] bg-[#FFF0F4] text-[#FF315C]';
  }

  load(): void {
    // Giữ nguyên khung trang và bảng khi đổi bộ lọc; skeleton toàn trang chỉ dùng ở lần tải đầu.
    if (!this.transactions().length && this.loading()) this.loading.set(true);
    this.error.set('');
    this.request?.unsubscribe();
    const presets: Record<string, string> = { 'Hôm nay': 'today', 'Hôm qua': 'yesterday', '7 ngày qua': 'last7days', '30 ngày qua': 'last30days', 'Tháng này': 'thismonth', 'Tháng trước': 'lastmonth' };
    const range = this.selectedDate() === 'Tùy chọn khác' ? this.appliedCustomRange() : null;
    this.request = forkJoin({ rows: this.purchaseHistory.list({
      status: this.selectedStatus() === 'all' ? '' : this.selectedStatus(), keyword: this.query().trim(),
      datePreset: presets[this.selectedDate()], dateFrom: range?.from, dateTo: range?.to,
    }), summary: this.purchaseHistory.summary() }).subscribe({
      next: ({ rows, summary }) => {
        this.transactions.set(rows);
        this.totalTransactions.set(summary.totalTransactions);
        this.totalSpent.set(summary.totalSpent);
        this.totalCoursesPurchased.set(summary.totalCoursesPurchased);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Không thể tải lịch sử mua hàng. Vui lòng thử lại.'); },
    });
  }

  setQuery(value: string): void { this.query.set(value); this.page.set(1); this.load(); }
  setStatus(value: StatusFilter): void { this.selectedStatus.set(value); this.statusOpen.set(false); this.page.set(1); this.load(); }
  setDate(value: string): void {
    if (value === 'Tùy chọn khác') {
      this.customRangeOpen.update(open => !open);
      this.activeCalendar.set(null);
      return;
    }
    this.selectedDate.set(this.selectedDate() === value ? 'Tất cả thời gian' : value);
    this.dateOpen.set(false);
    this.customRangeOpen.set(false);
    this.activeCalendar.set(null);
    this.page.set(1);
    this.load();
  }
  toggleCalendar(field: 'from' | 'to'): void {
    this.activeCalendar.set(this.activeCalendar() === field ? null : field);
  }
  setCustomDate(field: 'from' | 'to', value: string): void {
    (field === 'from' ? this.customFrom : this.customTo).set(value);
    this.activeCalendar.set(null);
  }
  cancelCustomDate(): void {
    const applied = this.appliedCustomRange();
    this.customFrom.set(applied?.from ?? '');
    this.customTo.set(applied?.to ?? '');
    this.activeCalendar.set(null);
    this.dateOpen.set(false);
    this.customRangeOpen.set(false);
  }
  applyCustomDate(): void {
    if (!this.customFrom() || !this.customTo() || this.invalidRange()) return;
    this.appliedCustomRange.set({ from: this.customFrom(), to: this.customTo() });
    this.selectedDate.set('Tùy chọn khác');
    this.activeCalendar.set(null);
    this.dateOpen.set(false);
    this.page.set(1);
    this.load();
  }
  formatDisplayDate(value: string): string {
    if (!value) return 'dd/mm/yyyy';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  @HostListener('document:keydown.escape')
  closeCalendarOnEscape(): void {
    if (this.activeCalendar()) this.activeCalendar.set(null);
    else if (this.dateOpen()) this.dateOpen.set(false);
  }
  setPage(value: number): void { this.page.set(Math.max(1, Math.min(value, this.pageCount()))); }
  statusLabel(): string { return this.statusOptions.find(option => option.value === this.selectedStatus())?.label ?? this.statusOptions[0].label; }
  private dateOf(row: TransactionRow): Date {
    if (row.timestamp) return new Date(row.timestamp);
    const [day, month, year] = row.date.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
}
