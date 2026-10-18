import { Injectable, signal } from '@angular/core';
import { MOCK_ORDERS, MOCK_PAYOUT_ADMIN_ROLE, MOCK_PAYOUTS, MOCK_VOUCHERS } from '../../../core/data/mock/business.mock';
import { BusinessOrder, BusinessVoucher, PayoutRequest } from '../models/business.models';

// TODO(pre-deploy): Nhớ xóa adapter demo này và thay bằng HttpClient service theo API contract đã xác minh.
@Injectable({ providedIn: 'root' })
export class BusinessDemoService {
  readonly orders = signal<BusinessOrder[]>(structuredClone(MOCK_ORDERS));
  readonly vouchers = signal<BusinessVoucher[]>(structuredClone(MOCK_VOUCHERS));
  readonly payouts = signal<PayoutRequest[]>(structuredClone(MOCK_PAYOUTS));
  readonly payoutRole = signal<'finance' | 'super'>(MOCK_PAYOUT_ADMIN_ROLE);

  saveVoucher(value: BusinessVoucher, editing: boolean): void {
    this.vouchers.update(items => editing
      ? items.map(item => item.code === value.code ? value : item)
      : [value, ...items]);
  }

  setVoucherLock(codes: string[], locked: boolean): void {
    this.vouchers.update(items => items.map(item => codes.includes(item.code) ? { ...item, locked } : item));
  }

  updatePayout(id: string, changes: Partial<PayoutRequest>): void {
    this.payouts.update(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
  }
}
