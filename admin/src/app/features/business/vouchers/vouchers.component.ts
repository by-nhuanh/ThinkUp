import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessVoucher, VoucherStatus } from '../models/business.models';
import { BusinessDemoService } from '../services/business-demo.service';
import { downloadCsv, money } from '../business-utils';

@Component({ selector: 'app-vouchers', standalone: true, imports: [FormsModule], templateUrl: './vouchers.component.html', styleUrl: './vouchers.component.css' })
export class VouchersComponent {
  private readonly data = inject(BusinessDemoService);
  readonly money = money;
  readonly vouchers = this.data.vouchers;
  readonly search = signal('');
  readonly sponsor = signal('');
  readonly status = signal<VoucherStatus | 'hidden' | ''>('');
  readonly selectedCodes = signal<string[]>([]);
  readonly detail = signal<BusinessVoucher | null>(null);
  readonly editing = signal(false);
  readonly form = signal<BusinessVoucher | null>(null);
  readonly confirm = signal<{ codes: string[]; locked: boolean } | null>(null);
  readonly error = signal('');
  readonly toast = signal('');
  readonly filtered = computed(() => this.vouchers().filter(item => {
    const query = this.search().trim().toLocaleUpperCase('vi-VN');
    return (!query || `${item.code} ${item.name}`.toLocaleUpperCase('vi-VN').includes(query))
      && (!this.sponsor() || item.sponsor === this.sponsor())
      && (!this.status() || (this.status() === 'hidden' ? ['scheduled', 'locked'].includes(this.statusOf(item)) : this.statusOf(item) === this.status()));
  }));
  readonly active = computed(() => this.vouchers().filter(item => this.statusOf(item) === 'active').length);
  readonly hidden = computed(() => this.vouchers().filter(item => ['scheduled', 'locked'].includes(this.statusOf(item))).length);
  readonly expired = computed(() => this.vouchers().filter(item => this.statusOf(item) === 'expired').length);
  readonly funded = computed(() => this.vouchers().reduce((sum, item) => sum + item.fundedAmount, 0));
  readonly thinkupFunded = computed(() => this.vouchers().filter(item => item.sponsor === 'thinkup').reduce((sum, item) => sum + item.fundedAmount, 0));
  readonly instructorFunded = computed(() => this.funded() - this.thinkupFunded());
  readonly activeThinkup = computed(() => this.vouchers().filter(item => item.sponsor === 'thinkup' && this.statusOf(item) === 'active').length);
  readonly activeInstructor = computed(() => this.active() - this.activeThinkup());

  statusOf(item: BusinessVoucher): VoucherStatus {
    if (item.endsAt <= this.localNow() || item.used >= item.limit) return 'expired';
    if (item.locked) return 'locked';
    if (item.startsAt > this.localNow()) return 'scheduled';
    return 'active';
  }
  statusLabel(value: VoucherStatus): string { return { active: 'Đang phát hành', scheduled: 'Chưa bắt đầu', locked: 'Tạm khóa', expired: 'Đã hết hạn' }[value]; }
  discount(item: BusinessVoucher): string { return item.discountType === 'fixed' ? money(item.discountValue) : `${item.discountValue}% · tối đa ${money(item.maxDiscount ?? 0)}`; }
  date(value: string): string { return value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4); }
  dateTime(value: string): string { return `${this.date(value)}, ${value.slice(11, 16)}`; }
  scopeLabel(item: BusinessVoucher): string {
    return { all: 'Toàn sàn', rating: 'Khóa học theo số sao', instructor: 'Theo giảng viên', courses: 'Theo khóa học' }[item.scope];
  }
  remaining(item: BusinessVoucher): number { return Math.max(0, item.limit - item.used); }
  remainingTone(item: BusinessVoucher): 'high' | 'medium' | 'low' {
    const percent = item.limit > 0 ? this.remaining(item) / item.limit : 0;
    return percent > .5 ? 'high' : percent > .2 ? 'medium' : 'low';
  }
  localNow(): string {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  setSearch(value: string): void { this.search.set(value.trimStart().toLocaleUpperCase('vi-VN')); this.selectedCodes.set([]); }
  setSponsor(value: string): void { this.sponsor.set(value); this.selectedCodes.set([]); }
  setStatus(value: VoucherStatus | 'hidden' | ''): void { this.status.set(value); this.selectedCodes.set([]); }
  async copyCode(code: string): Promise<void> {
    try { await navigator.clipboard.writeText(code); this.toast.set(`Đã sao chép mã ${code}.`); }
    catch { this.toast.set('Không thể sao chép mã. Vui lòng thử lại.'); }
  }
  toggle(code: string, checked: boolean): void { this.selectedCodes.update(items => checked ? [...items, code] : items.filter(value => value !== code)); }
  toggleAll(checked: boolean): void { this.selectedCodes.set(checked ? this.filtered().map(item => item.code) : []); }
  openNew(): void {
    this.editing.set(false); this.error.set('');
    this.form.set({ code: '', name: '', sponsor: 'thinkup', scope: 'all', discountType: 'fixed', discountValue: 0, minOrder: 0, used: 0, limit: 1, perAccount: 1, startsAt: '', endsAt: '', locked: false, fundedAmount: 0 });
  }
  openEdit(item: BusinessVoucher): void { this.detail.set(null); this.editing.set(true); this.error.set(''); this.form.set({ ...item }); }
  patch<K extends keyof BusinessVoucher>(key: K, value: BusinessVoucher[K]): void { this.form.update(item => item ? { ...item, [key]: value } : item); }
  changeSponsor(value: 'thinkup' | 'instructor'): void {
    this.form.update(item => item ? { ...item, sponsor: value, scope: value === 'instructor' ? 'courses' : 'all', scopeTarget: '', instructor: '' } : item);
  }
  save(): void {
    const value = this.form(); if (!value) return;
    const normalized = { ...value, code: value.code.trim().toUpperCase(), name: value.name.trim() };
    const duplicate = this.vouchers().some(item => item.code === normalized.code && (!this.editing() || item.code !== value.code));
    if (!/^[A-Z0-9-]+$/.test(normalized.code) || duplicate) { this.error.set('Mã voucher phải viết hoa, không dấu, không khoảng trắng và không trùng mã đã có.'); return; }
    if (!normalized.name || normalized.discountValue <= 0 || (normalized.discountType === 'percent' && (normalized.discountValue > 100 || !normalized.maxDiscount || normalized.maxDiscount <= 0)) || normalized.minOrder <= 0 || normalized.limit < 1 || normalized.perAccount < 1) { this.error.set('Điền tên, mức giảm và các giới hạn hợp lệ. Giá trị tiền phải lớn hơn 0.'); return; }
    if (normalized.sponsor === 'instructor' && (!normalized.instructor?.trim() || normalized.scope !== 'courses' || !normalized.scopeTarget?.trim())) { this.error.set('Voucher do giảng viên tài trợ cần chỉ định giảng viên và khóa học thuộc giảng viên đó.'); return; }
    if (normalized.scope === 'rating' && (!normalized.scopeTarget || Number(normalized.scopeTarget) < 1 || Number(normalized.scopeTarget) > 5)) { this.error.set('Nhập số sao từ 1 đến 5.'); return; }
    if (['instructor', 'courses'].includes(normalized.scope) && !normalized.scopeTarget?.trim()) { this.error.set('Chỉ định đối tượng áp dụng.'); return; }
    if (!normalized.startsAt || !normalized.endsAt || normalized.endsAt <= normalized.startsAt) { this.error.set('Thời gian kết thúc phải sau thời gian bắt đầu.'); return; }
    if (this.editing() && normalized.limit < normalized.used) { this.error.set('Tổng lượt phát hành không được thấp hơn số lượt đã dùng.'); return; }
    this.data.saveVoucher(normalized, this.editing()); this.form.set(null); this.toast.set('Đã cập nhật voucher.');
  }
  requestLock(codes: string[], locked: boolean): void {
    const eligible = this.vouchers().filter(item => codes.includes(item.code) && (locked ? ['active', 'scheduled'].includes(this.statusOf(item)) : item.locked && this.statusOf(item) !== 'expired')).map(item => item.code);
    if (eligible.length) this.confirm.set({ codes: eligible, locked });
  }
  applyLock(): void {
    const action = this.confirm(); if (!action) return;
    const eligible = this.vouchers().filter(item => action.codes.includes(item.code) && (action.locked ? this.statusOf(item) !== 'expired' : item.locked && item.endsAt > this.localNow() && item.used < item.limit)).map(item => item.code);
    this.data.setVoucherLock(eligible, action.locked);
    this.toast.set(`Đã ${action.locked ? 'tạm khóa' : 'mở khóa'} ${eligible.length}/${action.codes.length} voucher.`);
    this.selectedCodes.set([]); this.confirm.set(null);
  }
  export(): void { downloadCsv('thinkup-voucher.csv', [['Mã', 'Tên chương trình', 'Nguồn tài trợ', 'Mức giảm', 'Đơn tối thiểu', 'Đã dùng', 'Giới hạn', 'Bắt đầu', 'Kết thúc', 'Trạng thái'], ...this.filtered().map(item => [item.code, item.name, item.sponsor === 'thinkup' ? 'ThinkUp' : item.instructor ?? 'Giảng viên', this.discount(item), item.minOrder, item.used, item.limit, item.startsAt, item.endsAt, this.statusLabel(this.statusOf(item))])]); }
}
