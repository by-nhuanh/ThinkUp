import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MOCK_PAYOUTS, MOCK_PAYOUT_ADMIN_ROLE } from '../../../core/data/mock/business.mock';
import { downloadServerExport } from '../../../shared/utils/api-export';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { API_FETCH_PAGE_SIZE, collectAllPages } from '../../../shared/utils/api-paging';
import { ExportFormat } from '../../../shared/utils/export-formats';
import { BusinessOrder, BusinessVoucher, OrderStatus, PayoutRequest, VoucherWeeklyDay } from '../models/business.models';
import { voucherFundedAmount } from '../business-utils';
import {
  BusinessStore,
  OrderListFilters,
  OrderTotals,
  VoucherListFilters
} from './business.store';

/* ------------------------------- API shapes ------------------------------- */

interface ApiEnvelope {
  success?: boolean;
}

interface ApiOrderCourse {
  id?: string | null;
  title?: string | null;
  price?: number | null;
  originalPrice?: number | null;
}

interface ApiOrder {
  id: string;
  transactionId?: string | null;
  learner?: string | null;
  email?: string | null;
  status?: string;
  rawStatus?: string | null;
  method?: string | null;
  amount?: number | null;
  subtotal?: number | null;
  total?: number | null;
  voucherCode?: string | null;
  voucherDiscount?: number | null;
  courses?: ApiOrderCourse[];
  createdAt?: string | null;
  paidAt?: string | null;
  invoiceCode?: string | null;
}

interface ApiOrderList extends ApiEnvelope {
  items: ApiOrder[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiWeeklyDay {
  day: number;
  enabled: boolean;
  allDay: boolean;
  slots: Array<{ start: string; end: string }>;
}

interface ApiVoucher {
  id: string;
  source?: string;
  code: string;
  description?: string;
  sponsor?: 'thinkup' | 'instructor' | null;
  instructorId?: string | null;
  scope?: string;
  scopeTargetIds?: string[];
  minRating?: number | null;
  audience?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number | null;
  minOrder?: number;
  minCourseCount?: number;
  used?: number;
  limit?: number | null;
  perAccount?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  weeklySchedule?: ApiWeeklyDay[] | null;
  showOnSite?: boolean | null;
  status?: string;
  version?: number | null;
  createdAt?: string | null;
}

interface ApiVoucherList extends ApiEnvelope {
  items: ApiVoucher[];
  total: number;
  page: number;
  pageSize: number;
}

const WEEKDAY_LABELS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const MAX_VOUCHER_BULK = 50;

/**
 * Nguồn dữ liệu module kinh doanh gọi Admin API thật.
 *
 * - Đơn hàng + voucher: HTTP (`/api/admin/business/orders`, `/api/admin/business/vouchers`).
 * - Chi trả giảng viên: vẫn dùng dữ liệu minh họa vì backend chưa có luồng yêu cầu/duyệt/giải ngân
 *   thật (xem `business-payouts.md`). `payoutsAreDemo` = true để UI ghi rõ.
 *
 * Cách tải danh sách: đọc hết các trang (pageSize=100) rồi giữ nguyên bộ lọc/tìm kiếm/phân trang
 * phía client đang có trong component. Khi dữ liệu đơn/voucher lớn hơn vài nghìn dòng, chuyển bộ
 * lọc sang query server-side (đã có sẵn tham số).
 */
@Injectable({ providedIn: 'root' })
export class BusinessHttpService implements BusinessStore {
  private readonly http = inject(HttpClient);
  private readonly ordersApi = `${environment.apiUrl}/admin/business/orders`;
  private readonly vouchersApi = `${environment.apiUrl}/admin/business/vouchers`;

  private readonly orderState = signal<readonly BusinessOrder[]>([]);
  private readonly orderTotalsState = signal<OrderTotals>({ total: 0, success: 0, pending: 0, cancelled: 0 });
  private readonly voucherState = signal<readonly BusinessVoucher[]>([]);
  private readonly payoutState = signal<readonly PayoutRequest[]>(
    structuredClone(MOCK_PAYOUTS).map(item => ({ ...item, isDemo: true }))
  );
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly orders = this.orderState.asReadonly();
  readonly orderTotals = this.orderTotalsState.asReadonly();
  readonly vouchers = this.voucherState.asReadonly();
  readonly payouts = this.payoutState.asReadonly();
  readonly payoutRole = signal<'finance' | 'super'>(MOCK_PAYOUT_ADMIN_ROLE).asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly payoutsAreDemo = computed(() => true);

  constructor() {
    void this.reloadOrders();
    void this.reloadVouchers();
  }

  /* -------------------------------- Orders -------------------------------- */

  async reloadOrders(filters: OrderListFilters = {}): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const [orders, summary] = await Promise.all([
        this.fetchAllOrders(),
        firstValueFrom(this.http.get<{ success: boolean; total: number; successCount: number; pendingCount: number; cancelledCount: number }>(
          `${this.ordersApi}/summary`,
          { params: this.orderParams(filters) }
        ))
      ]);
      this.orderState.set(orders);
      this.orderTotalsState.set({
        total: Number(summary.total ?? orders.length),
        success: Number(summary.successCount ?? 0),
        pending: Number(summary.pendingCount ?? 0),
        cancelled: Number(summary.cancelledCount ?? 0)
      });
    } catch (error) {
      this.errorState.set(apiErrorMessage(error, 'Không tải được danh sách đơn hàng.'));
    } finally {
      this.loadingState.set(false);
    }
  }

  async exportOrders(format: ExportFormat, filters: OrderListFilters): Promise<void> {
    await downloadServerExport(this.http, {
      url: `${this.ordersApi}/export`,
      params: this.orderParamRecord(filters),
      fallbackFilename: 'thinkup-don-hang',
      format
    });
  }

  private orderParamRecord(filters: OrderListFilters): Record<string, string> {
    return compact<OrderListFilters>(filters);
  }

  private orderParams(filters: OrderListFilters): HttpParams {
    return new HttpParams({ fromObject: this.orderParamRecord(filters) });
  }

  private async fetchAllOrders(): Promise<BusinessOrder[]> {
    const result = await collectAllPages<ApiOrder>(
      async (page, pageSize) => {
        const params = new HttpParams({ fromObject: { page: String(page), pageSize: String(pageSize) } });
        const response = await firstValueFrom(this.http.get<ApiOrderList>(this.ordersApi, { params }));
        return {
          items: response.items ?? [],
          total: response.total ?? 0,
          page: response.page ?? page,
          pageSize: response.pageSize ?? pageSize,
          pages: Math.ceil((response.total ?? 0) / pageSize) || 1
        };
      },
      API_FETCH_PAGE_SIZE
    );
    return result.items.map(item => this.toOrder(item));
  }

  private toOrder(item: ApiOrder): BusinessOrder {
    const subtotal = Number(item.subtotal ?? item.total ?? item.amount ?? 0);
    const discount = Number(item.voucherDiscount ?? 0);
    const courses = item.courses ?? [];
    return {
      id: item.id,
      transactionId: item.transactionId ?? undefined,
      // API có thể không tìm thấy user (tài khoản đã xoá) — giữ nhãn thay vì chuỗi rỗng.
      learner: item.learner || '(không xác định)',
      email: item.email || '',
      // TODO(api-contract): `payment_transactions` không trả số điện thoại; hiển thị trống.
      phone: '',
      courses: courses.map(course => course.title || course.id || 'Khóa học'),
      courseItems: courses.map(course => ({
        courseName: course.title || course.id || 'Khóa học',
        salePrice: Number(course.price ?? 0)
      })),
      // TODO(api-contract): đơn hàng không trả tên giảng viên; chỉ có trong `order_summary.courses`.
      instructor: undefined,
      originalAmount: subtotal,
      discount,
      voucherCode: item.voucherCode ?? undefined,
      // TODO(api-contract): `payment_transactions` không trả nguồn tài trợ voucher (thinkup/instructor)
      // trên đơn hàng; phần phân bổ doanh thu trong chi tiết đang dựa trên giá trị này.
      sponsor: undefined,
      method: item.method || 'Không xác định',
      status: normalizeOrderStatus(item.status),
      createdAt: item.createdAt || '',
      paidAt: item.paidAt ?? undefined,
      invoiceId: item.invoiceCode ?? undefined,
      // TODO(api-contract): API không trả lý do/người huỷ/thời điểm huỷ; giữ trạng thái thanh toán
      // "unknown" thay vì suy diễn.
      cancellation: normalizeOrderStatus(item.status) === 'cancelled'
        ? { reason: '', cancelledAt: item.createdAt || '', cancelledBy: 'system', paymentState: 'unknown' }
        : undefined
    };
  }

  /* ------------------------------- Vouchers ------------------------------- */

  async reloadVouchers(filters: VoucherListFilters = {}): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const rows = await this.fetchAllVouchers();
      this.voucherState.set(rows);
    } catch (error) {
      this.errorState.set(apiErrorMessage(error, 'Không tải được danh sách voucher.'));
    } finally {
      this.loadingState.set(false);
    }
  }

  async exportVouchers(format: ExportFormat, filters: VoucherListFilters): Promise<void> {
    await downloadServerExport(this.http, {
      url: `${this.vouchersApi}/export`,
      params: compact<VoucherListFilters>(filters),
      fallbackFilename: 'thinkup-voucher',
      format
    });
  }

  private async fetchAllVouchers(): Promise<BusinessVoucher[]> {
    const result = await collectAllPages<ApiVoucher>(
      async (page, pageSize) => {
        const params = new HttpParams({ fromObject: { page: String(page), pageSize: String(pageSize) } });
        const response = await firstValueFrom(this.http.get<ApiVoucherList>(this.vouchersApi, { params }));
        return {
          items: response.items ?? [],
          total: response.total ?? 0,
          page: response.page ?? page,
          pageSize: response.pageSize ?? pageSize,
          pages: Math.ceil((response.total ?? 0) / pageSize) || 1
        };
      },
      API_FETCH_PAGE_SIZE
    );
    return result.items.map(item => this.toVoucher(item));
  }

  private toVoucher(item: ApiVoucher): BusinessVoucher {
    const schedule = Array.isArray(item.weeklySchedule) ? item.weeklySchedule : [];
    const scopeTargetIds = (item.scopeTargetIds ?? []).filter(Boolean);
    const voucher: BusinessVoucher = {
      id: item.id,
      code: item.code,
      description: item.description || '',
      sponsor: item.sponsor === 'instructor' ? 'instructor' : 'thinkup',
      // TODO(api-contract): API chỉ trả `instructorId`, không trả tên giảng viên. Hiển thị ID cho tới
      // khi backend bổ sung tên hoặc frontend có danh mục giảng viên để tra cứu.
      instructor: item.instructorId || undefined,
      instructorId: item.instructorId || undefined,
      scope: normalizeVoucherScope(item.scope),
      scopeTarget: item.scope === 'rating'
        ? (item.minRating != null ? String(item.minRating) : '')
        : scopeTargetIds.join(', '),
      scopeTargetIds,
      minRating: item.minRating ?? null,
      audience: item.audience === 'new_learner' ? 'new_learner' : 'all',
      discountType: item.discountType === 'percent' ? 'percent' : 'fixed',
      discountValue: Number(item.discountValue ?? 0),
      maxDiscount: item.maxDiscount == null ? undefined : Number(item.maxDiscount),
      minOrder: Number(item.minOrder ?? 0),
      minCourseCount: Number(item.minCourseCount ?? 1),
      used: Number(item.used ?? 0),
      // `usage_limit = null` nghĩa là không giới hạn; UI hiện chưa hỗ trợ nên hiển thị 0.
      limit: item.limit == null ? 0 : Number(item.limit),
      perAccount: Number(item.perAccount ?? 0),
      startsAt: item.startsAt || '',
      endsAt: item.endsAt || '',
      weeklyLimitEnabled: !!schedule.length,
      weeklySchedule: schedule.length ? schedule.map(toWeeklyDay) : undefined,
      showOnSite: item.showOnSite !== false,
      locked: item.status === 'locked',
      deleted: false,
      fundedAmount: 0,
      // TODO(api-contract): chưa có endpoint lịch sử thao tác voucher (`admin_audit_logs` không expose).
      auditLog: [],
      version: item.version ?? undefined,
      createdAt: item.createdAt ?? undefined
    };
    voucher.fundedAmount = voucherFundedAmount({ ...voucher, limit: voucher.limit || 0 });
    return voucher;
  }

  async saveVoucher(value: BusinessVoucher, editing: boolean): Promise<void> {
    this.errorState.set(null);
    const status = voucherStatusOf(value);
    if (editing && status === 'expired') {
      throw new Error('Voucher đã hết hạn nên không thể chỉnh sửa.');
    }

    if (editing) {
      // Hợp đồng PATCH bắt buộc `version` để tránh ghi đè.
      await firstValueFrom(this.http.patch(`${this.vouchersApi}/${encodeURIComponent(value.code)}`, {
        version: value.version,
        ...this.voucherPatch(value, status)
      }));
    } else {
      await firstValueFrom(this.http.post(this.vouchersApi, this.voucherCreate(value)));
    }
    await this.reloadVouchers();
  }

  /** Voucher đang chạy/đang khóa chỉ cho sửa một số trường; voucher chưa bắt đầu cho sửa rộng hơn. */
  private voucherPatch(value: BusinessVoucher, status: string): Record<string, unknown> {
    if (status === 'scheduled') {
      const { code: _code, sponsor: _sponsor, ...editable } = this.voucherCreate(value);
      return editable;
    }
    // Trường được phép với voucher active/locked theo `vouchers.admin.js`.
    return {
      description: value.description,
      // Backend từ chối `maxDiscount` với voucher giảm số tiền cố định.
      ...(value.discountType === 'percent' && value.maxDiscount ? { maxDiscount: value.maxDiscount } : {}),
      minOrder: value.minOrder,
      limit: value.limit,
      endsAt: value.endsAt
    };
  }

  private voucherCreate(value: BusinessVoucher): Record<string, unknown> {
    return {
      code: value.code,
      description: value.description,
      sponsor: value.sponsor,
      instructorId: value.instructorId || value.instructor || null,
      scope: value.scope,
      scopeTargetIds: this.scopeTargetIds(value),
      minRating: value.scope === 'rating' ? Number(value.scopeTarget) : (value.minRating ?? null),
      audience: value.audience,
      discountType: value.discountType,
      discountValue: value.discountValue,
      maxDiscount: value.discountType === 'percent' ? value.maxDiscount : null,
      minOrder: value.minOrder,
      minCourseCount: value.minCourseCount,
      limit: value.limit,
      perAccount: value.perAccount,
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      weeklySchedule: value.weeklyLimitEnabled ? value.weeklySchedule : null,
      showOnSite: value.showOnSite
    };
  }

  /**
   * API cần danh sách ObjectId, nhưng form hiện nhập tay chuỗi "mã khóa học / giảng viên".
   * Tách theo dấu phẩy để gửi mảng; UI cần thay bằng picker lấy từ API danh mục.
   */
  private scopeTargetIds(value: BusinessVoucher): string[] {
    if (value.scopeTargetIds?.length) return [...value.scopeTargetIds];
    if (value.scope === 'rating') return [];
    const source = value.scopeTarget?.trim();
    if (!source) return [];
    return source.split(/[,;]+/).map(part => part.trim()).filter(Boolean);
  }

  async deleteVoucher(code: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.vouchersApi}/${encodeURIComponent(code)}`));
    await this.reloadVouchers();
  }

  async setVoucherLock(codes: readonly string[], locked: boolean): Promise<void> {
    const unique = [...new Set(codes)];
    this.errorState.set(null);
    if (unique.length === 1) {
      await firstValueFrom(this.http.post(`${this.vouchersApi}/${encodeURIComponent(unique[0])}/${locked ? 'lock' : 'unlock'}`, {}));
      await this.reloadVouchers();
      return;
    }

    // API bulk giới hạn 50 mã mỗi lần; chia lô và báo lỗi từng mã nếu backend từ chối.
    for (let index = 0; index < unique.length; index += MAX_VOUCHER_BULK) {
      const chunk = unique.slice(index, index + MAX_VOUCHER_BULK);
      const response = await firstValueFrom(this.http.post<{ success: boolean; changed?: number; results?: Array<{ code: string; success: boolean; message?: string }> }>(
        `${this.vouchersApi}/${locked ? 'bulk-lock' : 'bulk-unlock'}`,
        { codes: chunk }
      ));
      const failed = (response.results ?? []).filter(row => !row.success);
      if (failed.length) {
        throw new Error(`Không đổi được trạng thái ${failed.length} voucher: ${failed.map(row => `${row.code} (${row.message || 'lỗi'})`).join(', ')}`);
      }
    }
    await this.reloadVouchers();
  }

  /* -------------------------------- Payouts ------------------------------- */

  /**
   * Payouts vẫn là dữ liệu minh họa (Q10). Chỉ cập nhật trong bộ nhớ để xem trước luồng UI;
   * không gọi API vì backend chưa có endpoint yêu cầu/duyệt/giải ngân.
   */
  /** Backend chưa có API xác nhận/hủy đơn; cập nhật trong bộ nhớ để xem trước luồng UI. */
  updateOrder(id: string, changes: Partial<BusinessOrder>): void {
    this.orderState.update(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
  }

  updatePayout(id: string, changes: Partial<PayoutRequest>): void {
    this.payoutState.update(items => items.map(item => item.id === id ? { ...item, ...changes, isDemo: true } : item));
  }
}

/* --------------------------------- Helpers -------------------------------- */

function compact<T extends object>(source: T): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = String(value);
  }
  return result;
}

function normalizeOrderStatus(value: string | undefined): OrderStatus {
  if (value === 'pending') return 'pending';
  if (value === 'cancelled') return 'cancelled';
  return 'success';
}

function normalizeVoucherScope(value: string | undefined): BusinessVoucher['scope'] {
  return value === 'rating' || value === 'instructor' || value === 'courses' ? value : 'all';
}

/** Trạng thái vận hành tính từ dữ liệu voucher; dùng để chọn trường được phép PATCH. */
function voucherStatusOf(value: BusinessVoucher): string {
  const now = new Date().toISOString();
  if ((value.limit > 0 && value.used >= value.limit) || (value.endsAt && value.endsAt <= now)) return 'expired';
  if (value.locked) return 'locked';
  if (value.startsAt && value.startsAt > now) return 'scheduled';
  return 'active';
}

function toWeeklyDay(day: ApiWeeklyDay): VoucherWeeklyDay {
  return {
    day: day.day,
    label: WEEKDAY_LABELS[day.day] ?? `Ngày ${day.day + 1}`,
    enabled: !!day.enabled,
    allDay: !!day.allDay,
    slots: Array.isArray(day.slots) ? day.slots.map(slot => ({ start: slot.start, end: slot.end })) : []
  };
}
