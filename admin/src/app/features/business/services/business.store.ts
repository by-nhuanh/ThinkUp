import { InjectionToken, Signal } from '@angular/core';
import { ExportFormat } from '../../../shared/utils/export-formats';
import { BusinessOrder, BusinessVoucher, OrderStatus, PayoutRequest } from '../models/business.models';

/** Bộ lọc danh sách đơn hàng — dùng cho cả danh sách lẫn export server-side. */
export interface OrderListFilters {
  q?: string;
  status?: OrderStatus | '';
  method?: string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
}

/** Bộ lọc danh sách voucher — chỉ gồm các trường backend hỗ trợ. */
export interface VoucherListFilters {
  q?: string;
  sponsor?: string;
  status?: string;
  scope?: string;
  discountType?: string;
  discountMin?: number | null;
  discountMax?: number | null;
  minOrderMin?: number | null;
  minOrderMax?: number | null;
  usedMin?: number | null;
  usedMax?: number | null;
  remainingMin?: number | null;
  remainingMax?: number | null;
  startsFrom?: string;
  startsTo?: string;
  endsFrom?: string;
  endsTo?: string;
}

export interface OrderTotals {
  total: number;
  success: number;
  pending: number;
  cancelled: number;
}

/**
 * Hợp đồng dữ liệu module kinh doanh.
 *
 * TODO(pre-deploy): Nhớ gỡ `BusinessDemoService` cùng `core/data/mock/business.mock.ts` khi chốt
 * dọn mock; hiện `environment.adminDataSource` quyết định nguồn dữ liệu.
 *
 * Payouts cố ý chưa có implementation HTTP: backend chưa có luồng yêu cầu/duyệt/giải ngân thật
 * (xem `business-payouts.md`). Giữ mock và ghi rõ phần còn thiếu.
 */
export interface BusinessStore {
  readonly orders: Signal<readonly BusinessOrder[]>;
  readonly orderTotals: Signal<OrderTotals>;
  readonly vouchers: Signal<readonly BusinessVoucher[]>;
  readonly payouts: Signal<readonly PayoutRequest[]>;
  readonly payoutRole: Signal<'finance' | 'super'>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<string | null>;
  /** `true` khi dữ liệu chi trả vẫn là dữ liệu minh họa. */
  readonly payoutsAreDemo: Signal<boolean>;

  reloadOrders(filters?: OrderListFilters): Promise<void>;
  reloadVouchers(filters?: VoucherListFilters): Promise<void>;
  exportOrders(format: ExportFormat, filters: OrderListFilters): Promise<void>;
  exportVouchers(format: ExportFormat, filters: VoucherListFilters): Promise<void>;

  saveVoucher(value: BusinessVoucher, editing: boolean): Promise<void>;
  deleteVoucher(code: string): Promise<void>;
  setVoucherLock(codes: readonly string[], locked: boolean): Promise<void>;

  /** Backend chưa có API xác nhận/hủy đơn; hiện chỉ cập nhật trong bộ nhớ để xem trước luồng UI. */
  updateOrder(id: string, changes: Partial<BusinessOrder>): void;
  updatePayout(id: string, changes: Partial<PayoutRequest>): void;
}

export const BUSINESS_STORE = new InjectionToken<BusinessStore>('BUSINESS_STORE');
