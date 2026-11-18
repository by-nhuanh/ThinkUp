import { Injectable, computed, signal } from '@angular/core';
import { MOCK_ORDERS, MOCK_ORDER_SUMMARY, MOCK_PAYOUT_ADMIN_ROLE, MOCK_PAYOUTS, MOCK_VOUCHERS } from '../../../core/data/mock/business.mock';
import { downloadTable, ExportFormat } from '../../../shared/utils/export-formats';
import { BusinessOrder, BusinessVoucher, OrderStatus, PayoutRequest, VoucherAuditAction, VoucherAuditEntry } from '../models/business.models';
import { voucherFundedAmount } from '../business-utils';
import { BusinessStore, OrderListFilters, OrderTotals, VoucherListFilters } from './business.store';

// TODO(pre-deploy): Nhớ xóa adapter demo này và thay bằng HttpClient service theo API contract đã xác minh.
/** Adapter dữ liệu minh họa — chỉ dùng khi `environment.adminDataSource = 'mock'`. */
@Injectable({ providedIn: 'root' })
export class BusinessDemoService implements BusinessStore {
  /** Tài khoản quản trị ghi vào lịch sử thao tác voucher. */
  // TODO(pre-deploy): Thay bằng tài khoản đang đăng nhập khi backend bàn giao API phiên quản trị.
  private readonly auditActor = 'admin@thinkup.vn';

  private readonly orderState = signal<readonly BusinessOrder[]>(structuredClone(MOCK_ORDERS));
  private readonly voucherState = signal<readonly BusinessVoucher[]>(structuredClone(MOCK_VOUCHERS).map(item => ({
    ...item,
    auditLog: item.auditLog.length ? item.auditLog : [{
      at: item.startsAt,
      actor: this.auditActor,
      action: 'created' as const,
      note: `Tạo voucher ${item.code}.`
    }]
  })));
  private readonly payoutState = signal<readonly PayoutRequest[]>(structuredClone(MOCK_PAYOUTS).map(item => ({ ...item, isDemo: true })));

  readonly orders = this.orderState.asReadonly();
  readonly orderTotals = computed<OrderTotals>(() => {
    const rows = this.orderState();
    const count = (status: OrderStatus): number => rows.filter(order => order.status === status).length;
    return {
      total: MOCK_ORDER_SUMMARY.total,
      success: count('success'),
      pending: count('pending'),
      cancelled: count('cancelled')
    };
  });
  readonly vouchers = this.voucherState.asReadonly();
  readonly payouts = this.payoutState.asReadonly();
  readonly payoutRole = signal<'finance' | 'super'>(MOCK_PAYOUT_ADMIN_ROLE).asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  readonly payoutsAreDemo = computed(() => true);

  async reloadOrders(_filters?: OrderListFilters): Promise<void> {
    // Dữ liệu demo đã nằm trong bộ nhớ; không có gì để tải lại.
  }

  async reloadVouchers(_filters?: VoucherListFilters): Promise<void> {
    // Dữ liệu demo đã nằm trong bộ nhớ; không có gì để tải lại.
  }

  async exportOrders(format: ExportFormat, filters: OrderListFilters): Promise<void> {
    const rows = this.orderState()
      .filter(order => (!filters.status || order.status === filters.status))
      .map(order => [order.id, order.transactionId ?? '', order.learner, order.email, order.courses.join('; '), order.originalAmount - order.discount, order.method, order.status, order.createdAt]);
    await downloadTable(format, 'thinkup-don-hang', [['Mã đơn', 'Mã giao dịch', 'Học viên', 'Email', 'Khóa học', 'Thực thu', 'Phương thức', 'Trạng thái', 'Ngày tạo'], ...rows]);
  }

  async exportVouchers(format: ExportFormat, _filters: VoucherListFilters): Promise<void> {
    const rows = this.voucherState()
      .filter(item => !item.deleted)
      .map(item => [item.code, item.sponsor, item.discountValue, item.minOrder, item.used, item.limit, item.startsAt, item.endsAt]);
    await downloadTable(format, 'thinkup-voucher', [['Mã', 'Nguồn tài trợ', 'Mức giảm', 'Đơn tối thiểu', 'Đã dùng', 'Giới hạn', 'Bắt đầu', 'Kết thúc'], ...rows]);
  }

  async saveVoucher(value: BusinessVoucher, editing: boolean): Promise<void> {
    const normalized: BusinessVoucher = { ...value, fundedAmount: voucherFundedAmount(value) };
    if (!editing) {
      normalized.auditLog = [this.auditEntry('created'), ...normalized.auditLog];
      this.voucherState.update(items => [normalized, ...items]);
      return;
    }
    const previous = this.voucherState().find(item => item.code === normalized.code);
    const changes = previous ? this.describeVoucherChanges(previous, normalized) : [];
    normalized.auditLog = [{
      ...this.auditEntry('updated'),
      note: changes.length ? `Đã thay đổi: ${changes.join(', ')}.` : `Đã lưu lại voucher ${normalized.code} nhưng không thay đổi dữ liệu.`
    }, ...normalized.auditLog];
    this.voucherState.update(items => items.map(item => item.code === normalized.code ? normalized : item));
  }

  /** Xoá mềm voucher: giữ bản ghi để đối soát các đơn hàng đã dùng mã này. */
  async deleteVoucher(code: string): Promise<void> {
    this.voucherState.update(items => items.map(item => item.code === code
      ? { ...item, deleted: true, locked: true, auditLog: [{ ...this.auditEntry('deleted'), note: 'Voucher đã bị xoá khỏi danh sách phát hành.' }, ...item.auditLog] }
      : item));
  }

  async setVoucherLock(codes: readonly string[], locked: boolean): Promise<void> {
    const entry = this.auditEntry(locked ? 'locked' : 'unlocked');
    this.voucherState.update(items => items.map(item => codes.includes(item.code)
      ? { ...item, locked, auditLog: [{ ...entry }, ...item.auditLog] }
      : item));
  }

  updateOrder(id: string, changes: Partial<BusinessOrder>): void {
    this.orderState.update(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
  }

  updatePayout(id: string, changes: Partial<PayoutRequest>): void {
    this.payoutState.update(items => items.map(item => item.id === id ? { ...item, ...changes, isDemo: true } : item));
  }

  private auditEntry(action: VoucherAuditAction, note?: string): VoucherAuditEntry {
    return { at: new Date().toISOString(), actor: this.auditActor, action, note };
  }

  private describeVoucherChanges(previous: BusinessVoucher, current: BusinessVoucher): string[] {
    const fields: ReadonlyArray<[keyof BusinessVoucher, string]> = [
      ['description', 'mô tả hiển thị'], ['sponsor', 'nguồn tài trợ'],
      ['instructor', 'giảng viên tài trợ'], ['scope', 'phạm vi áp dụng'], ['scopeTarget', 'đối tượng áp dụng'],
      ['audience', 'đối tượng học viên'], ['discountType', 'hình thức giảm'], ['discountValue', 'mức giảm'],
      ['maxDiscount', 'mức giảm tối đa'], ['minOrder', 'đơn tối thiểu'], ['minCourseCount', 'số khóa học tối thiểu'],
      ['limit', 'tổng lượt phát hành'], ['perAccount', 'giới hạn mỗi tài khoản'], ['startsAt', 'thời gian bắt đầu'],
      ['endsAt', 'thời gian kết thúc'], ['weeklyLimitEnabled', 'giới hạn lịch trong tuần'],
      ['weeklySchedule', 'khung giờ áp dụng'], ['showOnSite', 'hiển thị trên website']
    ];
    return fields.filter(([key]) => JSON.stringify(previous[key]) !== JSON.stringify(current[key])).map(([, label]) => label);
  }
}
