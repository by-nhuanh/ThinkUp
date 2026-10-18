import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDemoService } from '../services/business-demo.service';
import { PayoutRequest, PayoutStatus } from '../models/business.models';
import { dateTime, downloadCsv, matchesDates, money } from '../business-utils';

@Component({ selector: 'app-payouts', standalone: true, imports: [FormsModule], templateUrl: './payouts.component.html', styleUrl: './payouts.component.css' })
export class PayoutsComponent {
  private readonly data = inject(BusinessDemoService);
  private copyToastTimer: ReturnType<typeof setTimeout> | null = null;
  readonly money = money;
  readonly dateTime = dateTime;
  readonly Math = Math;
  readonly payouts = this.data.payouts;
  readonly search = signal('');
  readonly status = signal<PayoutStatus | ''>('');
  readonly limit = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly taxOnly = signal(false);
  readonly paidMonthOnly = signal(false);
  readonly role = this.data.payoutRole;
  readonly selected = signal<PayoutRequest | null>(null);
  readonly dialog = signal<'details' | 'review' | 'reject' | null>(null);
  private readonly returnFromReject = signal<'details' | 'review'>('details');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly quickRange = signal<'all' | 'today' | 'month' | 'last' | 'custom'>('all');
  readonly approvalNote = signal('');
  readonly rejectionReason = signal('');
  readonly rejectionDetails = signal('');
  readonly evidence = signal('');
  readonly error = signal('');
  readonly toast = signal('');
  readonly copiedId = signal(false);
  readonly filtered = computed(() => this.payouts().filter(item => {
    const query = this.search().trim().toLocaleLowerCase('vi-VN');
    return (!query || [item.id, item.instructor, item.email, item.accountNumber].some(value => value.toLocaleLowerCase('vi-VN').includes(query)))
      && (!this.status() || item.status === this.status())
      && (!this.limit() || (this.limit() === 'small' ? item.amount < 20000000 : item.amount >= 20000000))
      && (!this.taxOnly() || item.taxAmount > 0)
      && matchesDates(this.paidMonthOnly() && item.paidAt ? item.paidAt : item.submittedAt, this.from(), this.to());
  }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly visible = computed(() => this.filtered().slice((this.currentPage() - 1) * this.pageSize, this.currentPage() * this.pageSize));
  readonly pending = computed(() => this.payouts().filter(item => item.status === 'pending').length);
  readonly largePending = computed(() => this.payouts().filter(item => item.status === 'pending' && item.amount >= 20000000).length);
  readonly awaitingAmount = computed(() => this.payouts().filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount - item.taxAmount, 0));
  readonly paidAmount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, item) => sum + item.amount - item.taxAmount, 0));
  readonly paidCount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length);
  readonly taxAmount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, item) => sum + item.taxAmount, 0));

  statusLabel(value: PayoutStatus): string { return { pending: 'Chờ duyệt', approved: 'Chờ giải ngân', paid: 'Đã giải ngân', rejected: 'Bị từ chối' }[value]; }
  setStatus(value: PayoutStatus | ''): void { this.status.set(value); this.taxOnly.set(false); this.paidMonthOnly.set(false); this.page.set(1); }
  filterFromKpi(value: PayoutStatus): void { this.setStatus(value); this.from.set(''); this.to.set(''); this.quickRange.set('all'); }
  clear(): void { this.search.set(''); this.status.set(''); this.limit.set(''); this.from.set(''); this.to.set(''); this.taxOnly.set(false); this.paidMonthOnly.set(false); this.quickRange.set('all'); this.page.set(1); }
  setFrom(value: string): void { this.from.set(value); this.quickRange.set('custom'); this.page.set(1); }
  setTo(value: string): void { this.to.set(value); this.quickRange.set('custom'); this.page.set(1); }
  quickDate(value: string): void {
    if (value === 'custom') return;
    this.quickRange.set(value as 'all' | 'today' | 'month' | 'last');
    this.page.set(1);
    const now = new Date(); const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (value === 'all') { this.from.set(''); this.to.set(''); }
    if (value === 'today') { this.from.set(iso(now)); this.to.set(iso(now)); }
    if (value === 'month') { this.from.set(iso(new Date(now.getFullYear(), now.getMonth(), 1))); this.to.set(iso(now)); }
    if (value === 'last') { this.from.set(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))); this.to.set(iso(new Date(now.getFullYear(), now.getMonth(), 0))); }
  }
  filterPaid(): void { this.status.set('paid'); this.taxOnly.set(false); this.paidMonthOnly.set(true); this.quickDate('month'); }
  filterTax(): void { this.status.set('paid'); this.taxOnly.set(true); this.paidMonthOnly.set(true); this.quickDate('month'); }
  canApprove(item: PayoutRequest): boolean {
    const hasApprovalRole = this.role() === 'super' || (this.role() === 'finance' && item.amount < 20000000);
    return item.status === 'pending' && hasApprovalRole && item.verified && item.contractValid
      && !item.disputed && !!item.bank.trim() && !!item.accountNumber.trim() && !!item.accountName.trim()
      && item.availableBalance >= item.amount;
  }
  open(item: PayoutRequest, dialog: 'details' | 'review' | 'reject'): void { this.selected.set(item); this.returnFromReject.set('details'); this.dialog.set(dialog); this.error.set(''); this.clearCopyToast(); this.approvalNote.set(''); this.rejectionReason.set(''); this.rejectionDetails.set(''); this.evidence.set(''); }
  openReject(): void { this.returnFromReject.set(this.dialog() === 'review' ? 'review' : 'details'); this.error.set(''); this.dialog.set('reject'); }
  cancelReject(): void { this.error.set(''); this.dialog.set(this.returnFromReject()); }
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog() === 'reject') this.cancelReject();
    else if (this.selected()) this.close();
  }
  async copyRequestId(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      this.clearCopyToast();
      this.copiedId.set(true);
      this.copyToastTimer = setTimeout(() => this.clearCopyToast(), 2200);
    } catch {
      this.clearCopyToast();
      this.error.set('Không thể sao chép mã yêu cầu. Vui lòng chọn và sao chép thủ công.');
    }
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
    if (!this.canApprove(item)) { this.error.set('Chưa đủ quyền hoặc hồ sơ, số dư, hợp đồng chưa đáp ứng điều kiện duyệt.'); return; }
    this.data.updatePayout(item.id, { status: 'approved' }); this.close(); this.toast.set('Đã duyệt yêu cầu. Chờ kế toán giải ngân.');
  }
  reject(): void {
    const item = this.selected(); if (!item) return;
    if (!this.rejectionReason() || !this.rejectionDetails().trim()) { this.error.set('Chọn lý do và nhập giải thích chi tiết trước khi xác nhận.'); return; }
    this.data.updatePayout(item.id, { status: 'rejected', rejectionReason: `${this.rejectionReason()}: ${this.rejectionDetails().trim()}` });
    this.close(); this.toast.set('Đã từ chối yêu cầu.');
  }
  chooseEvidence(event: Event): void { this.evidence.set((event.target as HTMLInputElement).files?.[0]?.name ?? ''); }
  export(): void { downloadCsv('thinkup-rut-tien.csv', [['Mã yêu cầu', 'Giảng viên', 'Email', 'Số tiền yêu cầu', 'Thuế TNCN', 'Thực chi', 'Ngân hàng', 'Số tài khoản', 'Ngày gửi', 'Trạng thái'], ...this.filtered().map(item => [item.id, item.instructor, item.email, item.amount, item.taxAmount, item.amount - item.taxAmount, item.bank, item.accountNumber, dateTime(item.submittedAt), this.statusLabel(item.status)])]); }
}
