import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from '../../../core/services/toast.service';
import { PaymentPreferences } from '../../../core/models/payment.model';
import { Router } from '@angular/router';
import {
  LucideBookOpen,
  LucideCheck,
  LucideChevronRight,
  LucideCode,
  LucideCreditCard,
  LucideCrown,
  LucideDownload,
  LucideEllipsisVertical,
  LucideFileText,
  LucideGift,
  LucideMail,
  LucideMonitorPlay,
  LucideShieldCheck,
} from '@lucide/angular';
import { SettingsService } from '../services/settings.service';
import { PaymentMethod } from '../models/settings.model';
import { SettingsToggleComponent } from '../components/settings-toggle/settings-toggle.component';
import { SettingsBackButtonComponent } from '../components/settings-back-button/settings-back-button.component';

type PaymentTone = 'green' | 'pink' | 'yellow';
type TransactionIcon = 'book' | 'monitor' | 'gift' | 'code' | 'crown';

interface TransactionItem {
  id: string;
  title: string;
  date: string;
  value: string;
  tone: PaymentTone;
  icon: TransactionIcon;
}

interface InvoiceItem {
  id: string;
  code: string;
  date: string;
  amount: string;
}

/**
 * Cài đặt thanh toán. Bố cục, màu và typography khớp Figma node 3200:22503.
 */
@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    SettingsToggleComponent,
    SettingsBackButtonComponent,
    LucideBookOpen,
    LucideCheck,
    LucideChevronRight,
    LucideCode,
    LucideCreditCard,
    LucideCrown,
    LucideDownload,
    LucideEllipsisVertical,
    LucideFileText,
    LucideGift,
    LucideMail,
    LucideMonitorPlay,
    LucideShieldCheck,
  ],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class PaymentComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  private revision = 0;

  readonly back = () => void this.router.navigate(['/main/settings']);

  readonly methods = this.settingsService.paymentMethods;
  readonly methodNames: Record<PaymentMethod['type'], string> = {
    momo: 'MoMo Wallet',
    zalopay: 'ZaloPay',
    visa: 'Thẻ Visa',
  };

  readonly openMenuId = signal<string | null>(null);
  private readonly carouselStart = signal(0);

  /** Xoay danh sách phương thức khi bấm nút mũi tên bên phải (carousel trong Figma). */
  readonly visibleMethods = computed(() => {
    const methods = this.methods();
    if (methods.length < 2) return methods;
    const start = this.carouselStart() % methods.length;
    return [...methods.slice(start), ...methods.slice(0, start)];
  });

  transactions: TransactionItem[] = [];
  invoices: InvoiceItem[] = [];

  readonly savePayment = signal(false);
  readonly invoiceEmail = signal(true);
  readonly quickConfirm = signal(false);

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.settingsService.getPaymentSettings().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.applyPreferences(data.preferences);
        this.transactions = data.transactions.items.map(item => ({
          id: item.transaction_id,
          title: item.courses.map(course => course.title || '').join(', ') || item.order_id,
          date: item.created_at_local ? `${item.created_at_local.dateOnly} • ${item.created_at_local.timeOnly}` : item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '—',
          value: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: item.currency }).format(item.amount),
          tone: item.status === 'success' ? 'green' : 'yellow', icon: 'book',
        }));
        this.invoices = data.invoices.items.map(item => ({ id: item.id, code: item.code, date: item.issuedAt,
          amount: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: item.currency }).format(item.amount) }));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Không tải được cài đặt thanh toán. Vui lòng thử lại.'); },
    });
    this.settingsService.getPaymentMethods().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: () => this.toast.showToast({ type: 'warning', message: 'Không tải được phương thức thanh toán.' }),
    });
  }

  private applyPreferences(preferences: PaymentPreferences): void {
    this.savePayment.set(preferences.savePayment); this.invoiceEmail.set(preferences.invoiceEmail);
    this.quickConfirm.set(preferences.quickConfirm); this.revision = preferences.revision;
  }

  setInvoiceEmail(value: boolean): void {
    if (this.loading() || this.saving()) return;
    const previous = this.invoiceEmail();
    this.invoiceEmail.set(value);
    this.saving.set(true);
    this.settingsService.updatePaymentPreferences(this.revision, value).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { this.applyPreferences(data); this.saving.set(false); },
      error: error => {
        this.invoiceEmail.set(previous);
        this.saving.set(false);
        this.toast.showToast({ type: 'warning', message: error.status === 409 ? 'Cài đặt đã thay đổi. Đang tải lại để bạn kiểm tra trước khi lưu tiếp.' : 'Không lưu được cài đặt thanh toán.' });
        this.load();
      },
    });
  }

  downloadInvoice(invoice: InvoiceItem): void {
    this.settingsService.downloadPaymentInvoice(invoice.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${invoice.code}.pdf`; link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.showToast({ type: 'warning', message: 'Không thể tải hóa đơn PDF. Vui lòng thử lại.' }),
    });
  }

  viewTransactions(): void { void this.router.navigate(['/main/profile/billing']); }

  readonly badgeClass: Record<PaymentTone, string> = {
    green:
      'inline-flex items-center rounded-lg bg-[#DCFCE7] px-2.5 py-1 text-[12px] font-semibold leading-[18px] text-[#16A34A]',
    pink:
      'inline-flex items-center rounded-lg bg-[#FCE7F3] px-2.5 py-1 text-[12px] font-semibold leading-[18px] text-[#DB2777]',
    yellow:
      'inline-flex items-center rounded-lg bg-[#FEF9C3] px-2.5 py-1 text-[12px] font-semibold leading-[18px] text-[#CA8A04]',
  };

  readonly iconBoxClass: Record<TransactionIcon, string> = {
    book: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#EFF6FF] text-[#3B82F6]',
    monitor: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#F0FDF4] text-[#16A34A]',
    gift: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FDF2F8] text-[#DB2777]',
    code: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FEF3C7] text-[#D97706]',
    crown: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FEF9C3] text-[#CA8A04]',
  };

  toggleMenu(id: string): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  setDefaultMethod(id: string): void {
    this.toast.showToast({ type: 'info', message: 'Chưa thể đặt phương thức mặc định.' });
    this.closeMenu();
  }

  removeMethod(id: string): void {
    this.toast.showToast({ type: 'info', message: 'Chưa thể xóa phương thức thanh toán.' });
    this.closeMenu();
  }

  nextMethods(): void {
    this.carouselStart.update((index) => index + 1);
  }

  onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-payment-menu]')) this.closeMenu();
  }
}
