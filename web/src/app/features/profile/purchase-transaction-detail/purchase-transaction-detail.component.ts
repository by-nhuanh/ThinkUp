import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
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
  readonly detail = signal<TransactionDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly invoiceOpen = signal(false);
  readonly copied = signal('');

  ngOnInit(): void { this.load(); }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id) { this.loading.set(false); return; }
    this.loading.set(true);
    this.error.set('');
    this.purchaseHistory.detail(id).subscribe({
      next: detail => { this.detail.set(detail); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Không thể tải chi tiết giao dịch. Vui lòng thử lại.'); },
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
    const detail = this.detail();
    if (!detail || detail.status !== 'success') return;
    const lines = ['HÓA ĐƠN ĐIỆN TỬ THINKUP', `Mã hóa đơn: ${detail.invoice.code}`, `Mã giao dịch: ${detail.transactionCode}`, `Người mua: ${detail.invoice.buyer.name}`, `Email: ${detail.invoice.buyer.email}`, `Phương thức: ${detail.paymentMethod}`, ...detail.order.courses.map(course => `${course.title}: ${course.price}`), `Tổng thanh toán: ${detail.order.total}`];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${detail.invoice.code}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
