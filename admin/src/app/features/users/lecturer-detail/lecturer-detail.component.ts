import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LECTURER_STATUS_LABELS, LECTURER_STATUS_TONE } from '../../../core/data/mock/user-management.mock';
import { UserModalComponent } from '../components/user-modal/user-modal.component';
import { Lecturer } from '../models/user-management.models';
import { UserManagementService } from '../services/user-management.service';
import { formatCount, formatCurrency, formatRevenueShort } from '../user-management.utils';

type DetailModal = 'reject' | 'documents';

interface DocumentOption {
  key: string;
  label: string;
  state: string;
  stateLabel: string;
  tone: string;
}

const DOC_STATE_LABEL: Record<string, string> = {
  missing: 'Chưa nộp',
  invalid: 'Không hợp lệ',
  pending: 'Chờ xác minh',
  'not-started': 'Chưa bắt đầu'
};

const DOC_STATE_TONE: Record<string, string> = {
  missing: 'missing',
  invalid: 'invalid',
  pending: 'pending',
  'not-started': 'not-started'
};

/**
 * Trang "Thẩm định hồ sơ giảng viên" — frame Figma 5224:17686.
 * Quyết định duyệt / từ chối / yêu cầu bổ sung hồ sơ của một giảng viên.
 */
@Component({
  selector: 'app-lecturer-detail',
  standalone: true,
  imports: [RouterLink, UserModalComponent],
  templateUrl: './lecturer-detail.component.html',
  styleUrls: ['../user-page.css', '../user-modal-content.css', './lecturer-detail.component.css']
})
export class LecturerDetailComponent {
  private readonly data = inject(UserManagementService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly statusLabels = LECTURER_STATUS_LABELS;
  readonly statusTone = LECTURER_STATUS_TONE;
  readonly formatCurrency = formatCurrency;
  readonly formatCount = formatCount;
  readonly formatRevenueShort = formatRevenueShort;

  readonly lecturerId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' }
  );

  readonly lecturer = computed<Lecturer | undefined>(() => this.data.findLecturer(this.lecturerId()));

  readonly modal = signal<DetailModal | null>(null);
  readonly toast = signal('');

  // Từ chối hồ sơ
  readonly rejectReason = signal('');
  readonly rejectSendEmail = signal(true);

  // Yêu cầu bổ sung
  readonly documentSelection = signal<ReadonlyArray<string>>(['tax']);
  readonly documentGuidance = signal('');
  readonly documentDeadline = signal(7);
  readonly documentSendEmail = signal(true);

  readonly documentOptions = computed<DocumentOption[]>(() => {
    const items = this.lecturer()?.documents ?? [];
    return items.map((doc) => ({
      key: doc.key,
      label: doc.label,
      state: doc.state,
      stateLabel: DOC_STATE_LABEL[doc.state] ?? doc.state,
      tone: DOC_STATE_TONE[doc.state] ?? 'missing'
    }));
  });

  /** Chỉ hồ sơ đang chờ thẩm định / chờ bổ sung mới được ra quyết định. */
  readonly canDecide = computed(() => {
    const status = this.lecturer()?.status;
    return status === 'pending-review' || status === 'pending-docs';
  });

  readonly canReject = computed(() => this.rejectReason().trim().length >= 20);
  readonly canRequestDocuments = computed(() =>
    this.documentSelection().length > 0 && this.documentGuidance().trim().length >= 20);

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.toastTimer));
  }

  openReject(): void {
    this.rejectReason.set('');
    this.rejectSendEmail.set(true);
    this.modal.set('reject');
  }

  openDocuments(): void {
    this.documentSelection.set(this.documentOptions().filter((doc) => doc.state !== 'pending').map((doc) => doc.key).slice(0, 1));
    this.documentGuidance.set('');
    this.documentDeadline.set(7);
    this.documentSendEmail.set(true);
    this.modal.set('documents');
  }

  closeModal(): void {
    this.modal.set(null);
  }

  approve(): void {
    const lecturer = this.lecturer();
    if (!lecturer || !this.canDecide()) return;
    this.data.approveLecturer(lecturer.id);
    this.notify(`Đã duyệt chuyên môn cho ${lecturer.name} và chuyển sang bước pháp lý.`);
    void this.router.navigate(['/users/lecturers']);
  }

  submitReject(): void {
    const lecturer = this.lecturer();
    if (!lecturer || !this.canReject()) return;
    this.data.rejectLecturer(lecturer.id);
    this.modal.set(null);
    this.notify(`Đã từ chối hồ sơ ${lecturer.name}.`);
    void this.router.navigate(['/users/lecturers']);
  }

  submitDocuments(): void {
    const lecturer = this.lecturer();
    if (!lecturer || !this.canRequestDocuments()) return;
    this.data.requestDocuments(lecturer.id, this.documentSelection(), this.documentGuidance().trim(), this.documentDeadline());
    this.modal.set(null);
    this.notify(`Đã gửi yêu cầu bổ sung hồ sơ tới ${lecturer.name}.`);
    void this.router.navigate(['/users/lecturers']);
  }

  toggleDocument(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.documentSelection.update((current) => (checked
      ? [...current, key]
      : current.filter((item) => item !== key)));
  }

  isDocumentSelected(key: string): boolean {
    return this.documentSelection().includes(key);
  }

  setRejectReason(event: Event): void {
    this.rejectReason.set((event.target as HTMLTextAreaElement).value);
  }

  setDocumentGuidance(event: Event): void {
    this.documentGuidance.set((event.target as HTMLTextAreaElement).value);
  }

  notify(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3200);
  }
}
