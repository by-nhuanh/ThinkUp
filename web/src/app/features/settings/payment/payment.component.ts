import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
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
  LucidePlus,
  LucideShieldCheck,
} from '@lucide/angular';
import { SettingsService } from '../services/settings.service';
import { PaymentMethod } from '../models/settings.model';
import { SettingsToggleComponent } from '../components/settings-toggle/settings-toggle.component';
import { SettingsBackButtonComponent } from '../components/settings-back-button/settings-back-button.component';

type PaymentTone = 'green' | 'pink' | 'yellow';
type TransactionIcon = 'book' | 'monitor' | 'gift' | 'code' | 'crown';
type AddMethodType = 'momo' | 'zalopay' | 'visa';

interface AddMethodDraft {
  owner: string;
  phone: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  billingAddress: string;
  isDefault: boolean;
}

const EMPTY_ADD_METHOD_DRAFT: AddMethodDraft = {
  owner: '',
  phone: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  billingAddress: '',
  isDefault: false,
};

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
    LucidePlus,
    LucideShieldCheck,
  ],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onEscape()',
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

  // ─── Modal thêm phương thức thanh toán (UI-only) ───────────────────────────
  readonly addOpen = signal(false);
  readonly addType = signal<AddMethodType>('momo');
  readonly addDraft = signal<AddMethodDraft>({ ...EMPTY_ADD_METHOD_DRAFT });
  readonly addSubmitted = signal(false);
  readonly addNotice = signal('');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addMethodButton');
  private readonly addDialog = viewChild<ElementRef<HTMLElement>>('addDialog');
  private bodyOverflowBeforeModal = '';

  readonly addErrors = computed<Record<string, string>>(() => {
    const draft = this.addDraft();
    const errors: Record<string, string> = {};
    if (!draft.owner.trim()) {
      errors['owner'] = this.addType() === 'visa'
        ? 'Vui lòng nhập tên chủ thẻ.'
        : 'Vui lòng nhập tên chủ ví.';
    }
    if (this.addType() === 'visa') {
      const digits = draft.cardNumber.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) errors['cardNumber'] = 'Số thẻ phải có từ 13 đến 19 chữ số.';
      if (!this.isValidExpiry(draft.expiry)) errors['expiry'] = 'Ngày hết hạn không hợp lệ (MM / YY).';
      if (!/^\d{3,4}$/.test(draft.cvv)) errors['cvv'] = 'CVV phải là 3 hoặc 4 chữ số.';
    } else {
      const phone = draft.phone.replace(/[\s.-]/g, '');
      if (!/^(0|\+84)\d{9,10}$/.test(phone)) errors['phone'] = 'Số điện thoại không hợp lệ.';
    }
    return errors;
  });
  readonly addValid = computed(() => Object.keys(this.addErrors()).length === 0);

  readonly addTypeLabel = computed(() => {
    switch (this.addType()) {
      case 'momo':
        return 'Ví MoMo';
      case 'zalopay':
        return 'Ví ZaloPay';
      default:
        return 'Thẻ Visa';
    }
  });

  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => {
      if (this.addOpen()) document.body.style.overflow = this.bodyOverflowBeforeModal;
    });
  }

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

  onEscape(): void {
    if (this.addOpen()) {
      this.closeAddMethod();
      return;
    }
    this.closeMenu();
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

  // ─── Modal thêm phương thức ───────────────────────────────────────────────

  openAddMethod(): void {
    this.closeMenu();
    this.addType.set('momo');
    this.addDraft.set({ ...EMPTY_ADD_METHOD_DRAFT });
    this.addSubmitted.set(false);
    this.addNotice.set('');
    this.bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.addOpen.set(true);
  }

  closeAddMethod(): void {
    if (!this.addOpen()) return;
    this.addOpen.set(false);
    document.body.style.overflow = this.bodyOverflowBeforeModal;
    this.addButton()?.nativeElement.focus();
  }

  setAddType(type: AddMethodType): void {
    if (this.addType() === type) return;
    this.addType.set(type);
    this.addDraft.set({ ...EMPTY_ADD_METHOD_DRAFT });
    this.addSubmitted.set(false);
    this.addNotice.set('');
  }

  updateAddOwner(event: Event): void {
    this.patchAddDraft({ owner: (event.target as HTMLInputElement).value });
  }

  updateAddPhone(event: Event): void {
    this.patchAddDraft({ phone: (event.target as HTMLInputElement).value });
  }

  updateAddCardNumber(event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 19);
    this.patchAddDraft({ cardNumber: digits.replace(/(\d{4})(?=\d)/g, '$1 ') });
  }

  updateAddExpiry(event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
    this.patchAddDraft({ expiry: formatted });
  }

  updateAddCvv(event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
    this.patchAddDraft({ cvv: digits });
  }

  updateAddBillingAddress(event: Event): void {
    this.patchAddDraft({ billingAddress: (event.target as HTMLInputElement).value });
  }

  setAddDefault(value: boolean): void {
    this.patchAddDraft({ isDefault: value });
  }

  submitAddMethod(): void {
    this.addSubmitted.set(true);
    this.addNotice.set('');
    if (!this.addValid()) return;
    // Cần nối backend: POST liên kết phương thức thanh toán (MoMo/ZaloPay/Visa) + trạng thái mặc định.
    // Chưa có API/cổng thanh toán nên không lưu dữ liệu và không báo thành công giả.
    this.addNotice.set(
      `Chưa thể liên kết ${this.addTypeLabel()}: cổng thanh toán chưa được kết nối. Thông tin bạn nhập không được lưu.`,
    );
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeAddMethod();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = this.addDialog()?.nativeElement;
    if (!dialog) return;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(element => element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private patchAddDraft(patch: Partial<AddMethodDraft>): void {
    this.addDraft.update(draft => ({ ...draft, ...patch }));
    if (this.addNotice()) this.addNotice.set('');
  }

  private isValidExpiry(value: string): boolean {
    const match = value.replace(/\s/g, '').match(/^(\d{2})\/?(\d{2})$/);
    if (!match) return false;
    const month = Number(match[1]);
    if (month < 1 || month > 12) return false;
    const year = 2000 + Number(match[2]);
    const now = new Date();
    return new Date(year, month, 1) > new Date(now.getFullYear(), now.getMonth(), 1);
  }

  onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-payment-menu]')) this.closeMenu();
  }
}
