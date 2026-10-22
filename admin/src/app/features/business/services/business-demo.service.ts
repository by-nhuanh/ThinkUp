import { Injectable, signal } from '@angular/core';
import { MOCK_ORDERS, MOCK_ORDER_SUMMARY, MOCK_PAYOUT_ADMIN_ROLE, MOCK_PAYOUTS, MOCK_VOUCHERS } from '../../../core/data/mock/business.mock';
import { BusinessOrder, BusinessVoucher, PayoutRequest, VoucherAuditAction, VoucherAuditEntry } from '../models/business.models';
import { voucherFundedAmount } from '../business-utils';

// TODO(pre-deploy): Nhớ xóa adapter demo này và thay bằng HttpClient service theo API contract đã xác minh.
@Injectable({ providedIn: 'root' })
export class BusinessDemoService {
  /** Tài khoản quản trị ghi vào lịch sử thao tác voucher. */
  // TODO(pre-deploy): Thay bằng tài khoản đang đăng nhập khi backend bàn giao API phiên quản trị.
  private readonly auditActor = 'admin@thinkup.vn';

  readonly orderSummary = MOCK_ORDER_SUMMARY;
  readonly orders = signal<BusinessOrder[]>(structuredClone(MOCK_ORDERS));
  readonly vouchers = signal<BusinessVoucher[]>(structuredClone(MOCK_VOUCHERS).map(item => ({
    ...item,
    auditLog: item.auditLog.length ? item.auditLog : [{
      at: item.startsAt,
      actor: this.auditActor,
      action: 'created' as const,
      note: `Tạo voucher ${item.code}.`
    }]
  })));
  readonly payouts = signal<PayoutRequest[]>(structuredClone(MOCK_PAYOUTS));
  readonly payoutRole = signal<'finance' | 'super'>(MOCK_PAYOUT_ADMIN_ROLE);

  saveVoucher(value: BusinessVoucher, editing: boolean): void {
    const normalized: BusinessVoucher = { ...value, fundedAmount: voucherFundedAmount(value) };
    if (!editing) {
      normalized.auditLog = [this.auditEntry('created'), ...normalized.auditLog];
      this.vouchers.update(items => [normalized, ...items]);
      return;
    }
    const previous = this.vouchers().find(item => item.code === normalized.code);
    const changes = previous ? this.describeVoucherChanges(previous, normalized) : [];
    normalized.auditLog = [{
      ...this.auditEntry('updated'),
      note: changes.length ? `Đã thay đổi: ${changes.join(', ')}.` : `Đã lưu lại voucher ${normalized.code} nhưng không thay đổi dữ liệu.`
    }, ...normalized.auditLog];
    this.vouchers.update(items => items.map(item => item.code === normalized.code ? normalized : item));
  }

  /** Xoá mềm voucher: giữ bản ghi để đối soát các đơn hàng đã dùng mã này. */
  deleteVoucher(code: string): void {
    this.vouchers.update(items => items.map(item => item.code === code
      ? { ...item, deleted: true, locked: true, auditLog: [{ ...this.auditEntry('deleted'), note: 'Voucher đã bị xoá khỏi danh sách phát hành.' }, ...item.auditLog] }
      : item));
  }

  setVoucherLock(codes: string[], locked: boolean): void {
    const entry = this.auditEntry(locked ? 'locked' : 'unlocked');
    this.vouchers.update(items => items.map(item => codes.includes(item.code)
      ? { ...item, locked, auditLog: [{ ...entry }, ...item.auditLog] }
      : item));
  }

  updatePayout(id: string, changes: Partial<PayoutRequest>): void {
    this.payouts.update(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
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
