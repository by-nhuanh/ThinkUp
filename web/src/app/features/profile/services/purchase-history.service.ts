import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PaymentTransactionDto } from '../../../core/models/payment.model';
import { environment } from '../../../../environments/environment';
import { TransactionDetail, TransactionRow } from '../../../core/models/commerce.model';

interface PurchaseCoursePayload { title?: string; }
type PurchaseRowPayload = PaymentTransactionDto;
interface PurchaseListPayload { transactions: PurchaseRowPayload[]; total: number; }
interface PurchaseSummaryPayload {
  totalTransactions: number;
  totalSpent: number;
  totalCoursesPurchased: number;
}

const money = (value: number): string => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;

@Injectable({ providedIn: 'root' })
export class PurchaseHistoryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/user/purchase`;
  private readonly auth = inject(AuthService);
  private readonly guard = <T>(source: Observable<T>): Observable<T> => defer(() => {
    const token = this.auth.getToken();
    return source.pipe(map(value => {
      if (token !== this.auth.getToken()) throw new Error('Phiên đăng nhập đã thay đổi.');
      return value;
    }));
  });

  list(filters: { status?: string; keyword?: string; datePreset?: string; dateFrom?: string; dateTo?: string } = {}): Observable<TransactionRow[]> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params = params.set(key, value); });
    return this.http.get<PurchaseListPayload>(this.base, { params }).pipe(this.guard,
      map(response => response.transactions.map(row => {
        const created = row.created_at ? new Date(row.created_at) : null;
        const timestamp = created && !Number.isNaN(created.getTime()) ? created.getTime() : 0;
        return {
          id: row.transaction_id || row.order_id,
          courses: row.courses.map(course => course.title || ''),
          paymentMethod: row.payment_method === 'simulation' ? 'Thanh toán mô phỏng' : row.payment_method,
          amount: money(row.amount),
          status: row.status,
          date: row.created_at_local?.dateOnly || (timestamp ? created!.toLocaleDateString('vi-VN') : '—'),
          time: row.created_at_local?.timeOnly || (timestamp ? created!.toLocaleTimeString('vi-VN', { hour12: false }) : '—'),
          timestamp,
        };
      }))
    );
  }

  summary(): Observable<PurchaseSummaryPayload> {
    return this.http.get<PurchaseSummaryPayload>(`${this.base}/summary`).pipe(this.guard);
  }

  detail(id: string): Observable<TransactionDetail> {
    return this.http.get<TransactionDetail>(`${environment.apiUrl}/user/billing/${encodeURIComponent(id)}`).pipe(this.guard,
      map(detail => ({ ...detail, paymentMethod: detail.paymentMethod === 'simulation' ? 'Thanh toán mô phỏng' : detail.paymentMethod })));
  }
}
