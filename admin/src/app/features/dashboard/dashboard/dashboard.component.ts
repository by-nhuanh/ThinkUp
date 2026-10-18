import { Component, computed, signal } from '@angular/core';
import { AUDIT_LOGS, DASHBOARD_ACTIONS, DASHBOARD_METRICS, REVENUE_BARS, TOP_COURSES, type AuditLog } from '../../../core/data/mock/dashboard.mock';

type Period = 'Ngày' | 'Tuần' | 'Tháng' | 'Năm' | 'Quý';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  readonly metrics = DASHBOARD_METRICS;
  readonly actions = DASHBOARD_ACTIONS;
  readonly courses = TOP_COURSES;
  readonly bars = REVENUE_BARS;
  readonly periods: Period[] = ['Ngày', 'Tuần', 'Tháng', 'Năm', 'Quý'];
  readonly period = signal<Period>('Tháng');
  readonly filter = signal('Tất cả');
  readonly filterOpen = signal(false);
  readonly exportOpen = signal(false);
  readonly filterOptions = [
    { label: 'Tất cả', icon: 'filter-0.svg' },
    { label: 'Finance (FA)', icon: 'filter-1.svg' },
    { label: 'Academic (CA)', icon: 'filter-2.svg' },
    { label: 'Support (CS)', icon: 'filter-3.svg' },
    { label: 'Admin', icon: 'filter-0.svg' }
  ];
  readonly datePickerOpen = signal(true);
  readonly calendarMonth = signal('2026-09');
  readonly pickingEnd = signal(false);
  readonly calendarDays = computed(() => {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const startOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: Math.ceil((startOffset + days) / 7) * 7 }, (_, index) => index >= startOffset && index < startOffset + days ? index - startOffset + 1 : null);
  });
  readonly monthTitle = computed(() => {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    return `Tháng ${month}, ${year}`;
  });
  readonly startDate = signal('2026-09-01');
  readonly endDate = signal('2026-09-30');
  readonly rangeLabel = computed(() => `${this.displayDate(this.startDate())} - ${this.displayDate(this.endDate())}`);
  readonly selectedLog = signal<AuditLog | null>(null);
  readonly toast = signal<string | null>(null);
  readonly visibleLogs = computed(() => this.filter() === 'Tất cả' ? AUDIT_LOGS : AUDIT_LOGS.filter(log => log.role === this.filter()));
  readonly payoutPath = this.makePayoutPath();

  private makePayoutPath(): string {
    const points = REVENUE_BARS.map((bar, index) => ({ x: 34 + index * 58, y: 305 - bar.payout }));
    return points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const midpointX = (previous.x + point.x) / 2;
      return `${path} C ${midpointX} ${previous.y}, ${midpointX} ${point.y}, ${point.x} ${point.y}`;
    }, '');
  }

  // TODO(pre-deploy): Nhớ xóa thông báo thao tác mẫu này khi các chức năng quản trị được nối tới API thực tế.
  showPendingFeature(): void {
    this.toast.set('Chức năng hiện chưa khả dụng.');
    window.setTimeout(() => this.toast.set(null), 3500);
  }

  updateStart(event: Event): void { this.startDate.set((event.target as HTMLInputElement).value); }
  updateEnd(event: Event): void { this.endDate.set((event.target as HTMLInputElement).value); }
  changeMonth(offset: number): void {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    this.calendarMonth.set(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  chooseDay(day: number | null): void {
    if (day === null) return;
    const date = `${this.calendarMonth()}-${String(day).padStart(2, '0')}`;
    if (!this.pickingEnd()) { this.startDate.set(date); this.endDate.set(date); this.pickingEnd.set(true); }
    else { if (date < this.startDate()) { this.endDate.set(this.startDate()); this.startDate.set(date); } else this.endDate.set(date); this.pickingEnd.set(false); }
  }
  isDateSelected(day: number | null, boundary: 'start' | 'end'): boolean {
    return day !== null && `${this.calendarMonth()}-${String(day).padStart(2, '0')}` === (boundary === 'start' ? this.startDate() : this.endDate());
  }
  chooseToday(): void {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.startDate.set(today); this.endDate.set(today); this.calendarMonth.set(today.slice(0, 7)); this.pickingEnd.set(false);
  }
  private displayDate(value: string): string { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
  chooseFilter(value: string): void { this.filter.set(value); this.filterOpen.set(false); }

  exportLogs(): void {
    const rows = [['Thời gian', 'Tài khoản', 'Role', 'Hành động', 'IP'], ...this.visibleLogs().map(log => [log.time, log.account, log.role, log.action, log.ip])];
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'nhat-ky-quan-tri.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
