import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { CommerceService } from '../../../core/services/commerce.service';
import { PaymentStatus } from '../../../core/models/payment.model';

type ResultState = 'checking' | 'pending' | 'success' | 'failed' | 'expired';

/**
 * Trang kết quả thanh toán.
 * Backend VNPay redirect về `/main/checkout/result?transaction_id=...&status=success|failed&code=...`.
 * Trang này xác minh lại bằng GET /api/payment/status/:id thay vì tin hoàn toàn vào query string.
 */
@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './checkout-success.component.html',
  styleUrls: ['../../payment-ui.css', './checkout-success.component.css'],
})
export class CheckoutSuccessComponent implements OnInit {
  private commerce = inject(CommerceService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  state = signal<ResultState>('checking');
  transactionId = signal('');
  orderId = signal('');
  amount = signal(0);
  paidAt = signal<string | null>(null);
  errorMessage = signal('');

  private pollSub?: Subscription;
  private finalized = false;

  readonly title = computed(() => {
    switch (this.state()) {
      case 'success':
        return 'Thanh toán thành công!';
      case 'failed':
        return 'Giao dịch chưa hoàn tất';
      case 'expired':
        return 'Phiên thanh toán đã hết hạn';
      case 'pending':
        return 'Đang chờ xác nhận thanh toán';
      default:
        return 'Đang xác minh giao dịch';
    }
  });

  readonly message = computed(() => {
    switch (this.state()) {
      case 'success':
        return 'Cảm ơn bạn đã tin tưởng ThinkUp. Khóa học đã được thêm vào tài khoản và sẵn sàng để bạn bắt đầu học.';
      case 'failed':
        return this.errorMessage() || 'Giao dịch chưa thể hoàn tất. Bạn có thể thử lại hoặc chọn phương thức thanh toán khác.';
      case 'expired':
        return 'Thời gian giữ đơn đã kết thúc. Vui lòng quay lại giỏ hàng và tạo phiên thanh toán mới.';
      case 'pending':
        return 'Hệ thống đã ghi nhận yêu cầu thanh toán và đang chờ ngân hàng xác nhận. Trang sẽ tự cập nhật khi có kết quả.';
      default:
        return 'Vui lòng chờ trong giây lát, ThinkUp đang kiểm tra trạng thái giao dịch với cổng thanh toán.';
    }
  });

  readonly isBusy = computed(() => this.state() === 'checking' || this.state() === 'pending');

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const id = params.get('transaction_id') || params.get('transactionId') || params.get('id') || '';
    const queryStatus = (params.get('status') || '').toLowerCase();

    this.transactionId.set(id);

    if (!id) {
      this.state.set(queryStatus === 'failed' ? 'failed' : 'expired');
      this.errorMessage.set(
        queryStatus === 'failed'
          ? 'Cổng thanh toán trả về giao dịch không thành công. Vui lòng thử lại.'
          : 'Không tìm thấy mã giao dịch. Vui lòng kiểm tra lại đơn hàng trong mục Hóa đơn.',
      );
      return;
    }

    this.pollSub = timer(0, 4000)
      .pipe(
        switchMap(() =>
          this.commerce.getPaymentStatus(id).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(status => {
        if (!status) {
          this.state.set('pending');
          this.errorMessage.set('Kết nối xác minh tạm thời gián đoạn. Hệ thống sẽ tự thử lại.');
          return;
        }
        this.handleStatus(status);
      });
  }

  checkNow(): void {
    const id = this.transactionId();
    if (!id || this.state() === 'checking') return;

    this.commerce
      .getPaymentStatus(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: status => this.handleStatus(status),
        error: () => this.errorMessage.set('Không thể kiểm tra trạng thái giao dịch lúc này. Vui lòng thử lại sau.'),
      });
  }

  private handleStatus(status: PaymentStatus): void {
    if (status.orderId) this.orderId.set(status.orderId);
    if (status.amount) this.amount.set(status.amount);
    if (status.paidAt) this.paidAt.set(status.paidAt);

    switch (status.status) {
      case 'success':
        this.finishSuccess(status);
        break;
      case 'failed':
        this.stopPolling();
        this.state.set('failed');
        break;
      case 'expired':
        this.stopPolling();
        this.state.set('expired');
        break;
      default:
        this.state.set('pending');
        break;
    }
  }

  private finishSuccess(status: PaymentStatus): void {
    this.stopPolling();
    this.state.set('success');

    if (status.orderId) this.orderId.set(status.orderId);
    if (status.amount) this.amount.set(status.amount);
    if (status.paidAt) this.paidAt.set(status.paidAt);

    if (!this.finalized) {
      this.finalized = true;
      this.commerce.finalizeCheckout();
      this.commerce.setCheckoutVoucher(null);
    }
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
  }

  goToLearning(): void {
    void this.router.navigate(['/main/my-courses']);
  }

  goToBilling(): void {
    void this.router.navigate(['/main/profile/billing']);
  }

  goToCart(): void {
    void this.router.navigate(['/main/cart']);
  }

  retryPayment(): void {
    void this.router.navigate(['/main/checkout']);
  }

  formatPrice(value: number | null | undefined): string {
    return `${new Intl.NumberFormat('vi-VN').format(Math.max(0, Number(value) || 0))}đ`;
  }

  formatPaidAt(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('vi-VN', { hour12: false });
  }
}
