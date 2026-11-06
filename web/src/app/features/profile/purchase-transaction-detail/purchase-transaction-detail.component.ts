import { Component, DestroyRef, HostListener, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TransactionDetail } from '../../../core/models/commerce.model';
import { PurchaseHistoryService } from '../services/purchase-history.service';
import { InstructorTriggerDirective } from '../../../shared/directives/instructor-trigger.directive';

@Component({
  selector: 'app-purchase-transaction-detail',
  standalone: true,
  imports: [RouterLink, InstructorTriggerDirective],
  templateUrl: './purchase-transaction-detail.component.html',
  styleUrl: './purchase-transaction-detail.component.css',
})
export class PurchaseTransactionDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly purchaseHistory = inject(PurchaseHistoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private request?: Subscription;
  readonly detail = signal<TransactionDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly invoiceOpen = signal(false);
  readonly copied = signal('');

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id) { this.loading.set(false); return; }
    this.loading.set(true);
    this.error.set('');
    this.detail.set(null); this.invoiceOpen.set(false); this.request?.unsubscribe();
    this.request = this.purchaseHistory.detail(id).subscribe({
      next: detail => { this.detail.set(detail); this.loading.set(false); },
      error: error => { this.loading.set(false); this.error.set(error.status === 409 ? 'Dữ liệu lịch sử chưa đủ hoặc chưa khớp để dựng hóa đơn. Vui lòng liên hệ hỗ trợ.' : 'Không thể tải chi tiết giao dịch. Vui lòng thử lại.'); },
    });
  }

  @HostListener('document:keydown.escape')
  closeInvoice(): void { this.invoiceOpen.set(false); }

  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(value);
      window.setTimeout(() => this.copied.set(''), 1600);
    } catch { this.copied.set(''); }
  }

  downloadInvoice(): void {
    this.toast.showToast({ type: 'info', message: 'Bạn có thể in hóa đơn trực tiếp từ trình duyệt.' });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = { success: 'Giao dịch thành công', pending: 'Đang chờ thanh toán', paid: 'Đã nhận tiền, đang cấp quyền học', failed: 'Giao dịch thất bại', expired: 'Phiên thanh toán đã hết hạn', cancelled: 'Lần thanh toán đã được thay thế', needs_review: 'Giao dịch cần đối soát' };
    return labels[status] || 'Chưa xác minh được trạng thái giao dịch';
  }
}
