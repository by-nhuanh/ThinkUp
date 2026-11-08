import { afterNextRender, Component, computed, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { LucideArrowRight, LucideCircleDollarSign, LucideGraduationCap, LucideMonitorUp, LucideTrendingUp, LucideUsersRound } from '@lucide/angular';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { AdminNumberPipe } from '../../../shared/pipes/admin-number.pipe';
import { AdminPrivacyPipe } from '../../../shared/pipes/admin-privacy.pipe';
import { AUDIT_LOGS, DASHBOARD_ACTIONS, DASHBOARD_METRICS, REVENUE_BARS, TOP_COURSES, type AuditLog } from '../../../core/data/mock/dashboard.mock';

type Period = 'Ngày' | 'Tuần' | 'Tháng' | 'Năm' | 'Quý';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AdminNumberPipe, AdminPrivacyPipe, DateTimePickerComponent, CustomSelectComponent, ExportMenuComponent, LucideArrowRight, LucideCircleDollarSign, LucideGraduationCap, LucideMonitorUp, LucideTrendingUp, LucideUsersRound],
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
  readonly filterOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'Tất cả', label: 'Tất cả' },
    { value: 'Finance (FA)', label: 'Finance (FA)' },
    { value: 'Academic (CA)', label: 'Academic (CA)' },
    { value: 'Support (CS)', label: 'Support (CS)' },
    { value: 'Admin', label: 'Admin' }
  ];
  readonly datePickerOpen = signal(false);
  readonly datePopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null);
  private readonly injector = inject(Injector);
  private readonly dateTrigger = viewChild<ElementRef<HTMLButtonElement>>('dateTrigger');
  private readonly datePopover = viewChild<ElementRef<HTMLElement>>('datePopover');
  readonly startDate = signal('2026-09-01');
  readonly endDate = signal('2026-09-30');
  readonly rangeLabel = computed(() => `${this.displayDate(this.startDate())} - ${this.displayDate(this.endDate())}`);
  readonly selectedLog = signal<AuditLog | null>(null);
  readonly toast = signal<string | null>(null);
  readonly visibleLogs = computed(() => this.filter() === 'Tất cả' ? AUDIT_LOGS : AUDIT_LOGS.filter(log => log.role === this.filter()));
  readonly payoutPath = this.makePayoutPath();

  toggleDatePopover(): void {
    if (this.datePickerOpen()) {
      this.closeDatePopover();
      return;
    }

    this.datePickerOpen.set(true);
    afterNextRender(() => this.positionDatePopover(), { injector: this.injector });
  }

  closeDatePopover(): void {
    this.datePickerOpen.set(false);
    this.datePopoverPosition.set(null);
  }

  @HostListener('document:keydown.escape')
  closeDatePopoverOnEscape(): void {
    if (!this.datePickerOpen()) return;
    this.closeDatePopover();
    this.dateTrigger()?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  closeDatePopoverOnOutsideClick(event: MouseEvent): void {
    if (!this.datePickerOpen()) return;
    const path = event.composedPath();
    const trigger = this.dateTrigger()?.nativeElement;
    const popover = this.datePopover()?.nativeElement;
    if ((trigger && path.includes(trigger)) || (popover && path.includes(popover))) return;
    this.closeDatePopover();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  positionDatePopover(): void {
    const trigger = this.dateTrigger()?.nativeElement;
    const popover = this.datePopover()?.nativeElement;
    if (!trigger || !popover) return;

    const margin = 12;
    const gap = 8;
    const anchor = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const left = Math.max(margin, Math.min(anchor.right - popover.offsetWidth, viewportWidth - margin - popover.offsetWidth));
    const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
    const above = Math.max(0, anchor.top - gap - margin);
    const height = popover.scrollHeight + popover.offsetHeight - popover.clientHeight;
    const opensAbove = below < height && above > below;
    const maxHeight = Math.min(opensAbove ? above : below, viewportHeight - 2 * margin);
    const top = opensAbove ? anchor.top - gap - Math.min(height, maxHeight) : anchor.bottom + gap;

    this.datePopoverPosition.set({
      left,
      top: Math.max(margin, Math.min(top, viewportHeight - margin - maxHeight)),
      maxHeight
    });
  }

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

  chooseToday(): void {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.startDate.set(today); this.endDate.set(today);
  }
  private displayDate(value: string): string { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
  chooseFilter(value: string): void { this.filter.set(value); }

  exportLogs(format: ExportFormat): void {
    downloadTable(format, 'nhat-ky-quan-tri', [
      ['Thời gian', 'Tài khoản', 'Role', 'Hành động', 'IP'],
      ...this.visibleLogs().map(log => [log.time, log.account, log.role, log.action, log.ip])
    ]);
  }
}
