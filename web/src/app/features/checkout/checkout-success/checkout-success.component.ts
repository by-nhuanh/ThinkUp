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
  readonly isSimulated = signal<boolean | null>(null);
  readonly invoiceCode = signal('');
  readonly paymentContent = signal('');
  readonly receiptError = signal('');

  private pollSub?: Subscription;
  private finalized = false;
  private verifiedStatus: PaymentStatus['status'] | null = null;
  private verificationUnavailable = false;

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
        if (this.isSimulated() === null) return 'Khóa học đã được cấp vào tài khoản của bạn.';
        return 'Cảm ơn bạn đã tin tưởng ThinkUp. Khóa học đã được thêm vào tài khoản và sẵn sàng để bạn bắt đầu học.';
      case 'failed':
        return this.errorMessage() || 'Giao dịch chưa thể hoàn tất. Bạn có thể thử lại hoặc chọn phương thức thanh toán khác.';
      case 'expired':
        return 'Thời gian giữ đơn đã kết thúc. Vui lòng quay lại giỏ hàng và tạo phiên thanh toán mới.';
      case 'pending':
        return this.errorMessage() || 'Hệ thống đang chờ ngân hàng xác nhận. Trang sẽ tự cập nhật khi có kết quả.';
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
          this.commerce.getPaymentStatus(id).pipe(catchError(error => {
            this.verificationUnavailable = [401, 403, 404].includes(error.status);
            if (this.verificationUnavailable) {
              this.stopPolling(); this.state.set('failed');
              this.errorMessage.set('Không thể truy cập giao dịch. Vui lòng kiểm tra phiên đăng nhập và mã giao dịch.');
            }
            return of(null);
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(status => {
        if (!status) {
          if (this.verificationUnavailable) return;
          this.state.set('pending');
          this.errorMessage.set('Kết nối xác minh tạm thời gián đoạn. Hệ thống sẽ tự thử lại.');
          return;
        }
        this.handleStatus(status);
      });
  }

  checkNow(): void {
    const id = this.transactionId();
    if (!id) return;

    this.state.set('checking');
    this.errorMessage.set('');

    this.commerce
      .getPaymentStatus(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: status => this.handleStatus(status),
        error: (err: any) => {
          this.state.set('pending');
          this.errorMessage.set(
            err?.status === 404
              ? 'Không tìm thấy thông tin giao dịch hoặc phiên đăng nhập không trùng khớp.'
              : 'Không thể kiểm tra trạng thái giao dịch lúc này. Vui lòng thử lại sau.'
          );
        },
      });
  }

  private handleStatus(status: PaymentStatus): void {
    if (this.finalized) return;
    this.verificationUnavailable = false;
    this.verifiedStatus = status.status;
    this.errorMessage.set('');
    if (status.orderId) this.orderId.set(status.orderId);
    this.amount.set(status.amount);
    if (status.paidAt) this.paidAt.set(status.paidAt);

    switch (status.status) {
      case 'success':
        if (status.fulfillmentStatus === 'completed') this.finishSuccess(status);
        else { this.state.set('pending'); this.errorMessage.set('Đã nhận tiền, đang xác nhận quyền học. Không thanh toán lại.'); }
        break;
      case 'paid':
        this.state.set('pending');
        this.errorMessage.set('Đã nhận tiền, đang cấp quyền học. Không thanh toán lại.');
        break;
      case 'needs_review':
        this.state.set('pending');
        this.errorMessage.set('Giao dịch cần đối soát. Vui lòng liên hệ hỗ trợ và không thanh toán lại.');
        this.stopPolling();
        break;
      case 'cancelled':
        this.stopPolling();
        this.state.set('failed');
        this.errorMessage.set('Lần thanh toán này đã được thay thế. Không sử dụng lại mã QR hoặc đường dẫn cũ.');
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
      this.commerce.getPaymentReceipt(status.transactionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: receipt => {
          this.isSimulated.set(receipt.isSimulated);
          this.invoiceCode.set(receipt.invoiceCode);
          this.paymentContent.set(receipt.paymentContent);
        },
        error: () => this.receiptError.set('Đơn đã hoàn tất nhưng chưa tải được chi tiết hóa đơn. Bạn có thể kiểm tra lại trong lịch sử giao dịch.'),
      });
      if (this.commerce.isCurrentPaymentAttempt(status.transactionId)) {
        this.commerce.resetPaymentAttempt(status.transactionId);
        this.commerce.finalizeCheckout();
        this.commerce.setCheckoutVoucher(null);
      }
      this.commerce.refreshCart().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        error: () => this.errorMessage.set('Thanh toán thành công nhưng chưa tải lại được giỏ hàng.'),
      });
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
    if (!this.verifiedStatus || this.verifiedStatus === 'paid' || this.verifiedStatus === 'needs_review' || this.verifiedStatus === 'cancelled') {
      this.errorMessage.set('Cần xác minh trạng thái giao dịch trước khi thanh toán lại.');
      return;
    }
    this.commerce.resetPaymentAttempt(this.transactionId());
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
