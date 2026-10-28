import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfile } from '../../../../../core/models/profile.model';
import {
  bioTextLength,
  isValidPersonName,
  isValidSocialLink,
  maskEmail,
  maskPhone,
  parseBirthDate,
  sanitizeBioHtml,
} from '../../../utils/profile-form.utils';

export interface ProfileFormValue {
  lastName: string;
  firstName: string;
  gender: string;
  birthDate: string;
  bio: string;
  facebook: string;
  linkedin: string;
  x: string;
  youtube: string;
  github: string;
  portfolio: string;
}

interface FormStateEvent {
  dirty: boolean;
  valid: boolean;
  value: ProfileFormValue;
}

const BIO_LIMIT = 250;

@Component({
  selector: 'app-profile-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-form.component.html',
  styleUrl: './profile-form.component.css',
})
export class ProfileFormComponent implements AfterViewInit {
  @Input({ required: true }) profile!: UserProfile;
  @Input() isSaving = false;
  /** Thay đổi ngoài form (ví dụ ảnh đại diện) cũng phải bật nút Lưu. */
  @Input() externalDirty = false;

  @Output() stateChange = new EventEmitter<FormStateEvent>();
  @Output() save = new EventEmitter<ProfileFormValue>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('bioEditor') private bioEditor?: ElementRef<HTMLElement>;

  readonly bioLimit = BIO_LIMIT;
  readonly socialFields = [
    { name: 'facebook', prefix: 'facebook.com/', host: 'facebook.com', placeholder: 'https://facebook.com/' },
    { name: 'linkedin', prefix: 'linkedin.com/in/', host: 'linkedin.com', placeholder: 'https://linkedin.com/in/' },
    { name: 'x', prefix: 'x.com/', host: 'x.com', placeholder: 'https://x.com/' },
    { name: 'youtube', prefix: 'youtube.com/', host: 'youtube.com', placeholder: 'https://youtube.com/' },
    { name: 'github', prefix: 'github.com/', host: 'github.com', placeholder: 'https://github.com/' },
    { name: 'portfolio', prefix: 'portfolio/', host: '', placeholder: 'https://your-portfolio.com/' },
  ] as const;

  form: ProfileFormValue = this.emptyForm();

  readonly errors: Record<string, string> = {};
  readonly touched = new Set<string>();

  bioLength = 0;
  dirty = false;
  valid = true;

  private initialSnapshot = '';

  get maskedEmail(): string {
    return this.profile.maskedEmail || maskEmail(this.profile.email);
  }

  get maskedPhone(): string {
    return this.profile.maskedPhone || maskPhone(this.profile.phone);
  }

  ngOnInit(): void {
    this.form = {
      lastName: this.profile.lastName ?? this.splitName().lastName,
      firstName: this.profile.firstName ?? this.splitName().firstName,
      gender: this.profile.gender ?? '',
      birthDate: this.profile.birthDate ?? '',
      bio: this.profile.bio ?? '',
      facebook: this.profile.facebook ?? '',
      linkedin: this.profile.linkedin ?? '',
      x: this.profile.x ?? '',
      youtube: this.profile.youtube ?? '',
      github: this.profile.github ?? '',
      portfolio: this.profile.portfolio ?? '',
    };
    this.bioLength = bioTextLength(this.form.bio);
    this.initialSnapshot = this.snapshot();
    this.emitState();
  }

  ngAfterViewInit(): void {
    const editor = this.bioEditor?.nativeElement;
    if (!editor) return;
    editor.innerHTML = this.toEditorHtml(this.profile.bio ?? '');
    this.form.bio = editor.innerHTML;
    this.bioLength = bioTextLength(this.form.bio);
  }

  /** Trả về true khi form hợp lệ và đã có thay đổi (BR-05). */
  get canSave(): boolean {
    return (this.dirty || this.externalDirty) && this.valid && !this.isSaving;
  }

  get bioOverLimit(): boolean {
    return this.bioLength > BIO_LIMIT;
  }

  onFieldChange(field: keyof ProfileFormValue, value: string): void {
    this.form = { ...this.form, [field]: value };
    if (this.touched.has(field)) this.validateField(field);
    this.emitState();
  }

  onFieldBlur(field: string): void {
    this.touched.add(field);
    this.validateField(field);
    this.emitState();
  }

  onBioInput(event: Event): void {
    const editor = event.target as HTMLElement;
    this.form.bio = editor.innerHTML;
    this.bioLength = bioTextLength(this.form.bio);
    this.touched.add('bio');
    this.validateBio();
    this.emitState();
  }

  onBioBlur(): void {
    this.touched.add('bio');
    this.validateBio();
    this.emitState();
  }

  applyBioCommand(command: 'bold' | 'italic'): void {
    const editor = this.bioEditor?.nativeElement;
    if (!editor) return;
    editor.focus();
    document.execCommand(command);
    this.form.bio = editor.innerHTML;
    this.bioLength = bioTextLength(this.form.bio);
    this.validateBio();
    this.emitState();
  }

  onSubmit(): void {
    if (!this.canSave) return;
    this.markTouchedAll();
    this.validateAll();
    this.emitState();
    if (!this.valid) return;
    this.save.emit({ ...this.form, bio: sanitizeBioHtml(this.form.bio) });
  }

  /** Cho phép component cha lấy dữ liệu đã sanitize để gửi API. */
  getSanitizedValue(): ProfileFormValue {
    return { ...this.form, bio: sanitizeBioHtml(this.form.bio) };
  }

  private splitName(): { lastName: string; firstName: string } {
    const parts = (this.profile.name ?? '').trim().split(/\s+/);
    if (parts.length < 2) return { lastName: '', firstName: parts[0] ?? '' };
    return { lastName: parts.slice(0, -1).join(' '), firstName: parts[parts.length - 1] };
  }

  private toEditorHtml(value: string): string {
    if (!value) return '';
    if (/<[a-z][\s\S]*>/i.test(value)) return sanitizeBioHtml(value);
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private snapshot(): string {
    return JSON.stringify({ ...this.form, bio: this.form.bio.trim() });
  }

  private emitState(): void {
    this.valid = Object.keys(this.validateAll()).length === 0;
    this.dirty = this.snapshot() !== this.initialSnapshot;
    this.stateChange.emit({
      dirty: this.dirty,
      valid: this.valid,
      value: this.getSanitizedValue(),
    });
  }

  private markTouchedAll(): void {
    ['lastName', 'firstName', 'gender', 'birthDate', 'bio', ...this.socialFields.map((f) => f.name)].forEach(
      (field) => this.touched.add(field)
    );
  }

  private validateAll(): Record<string, string> {
    const next: Record<string, string> = {};
    const assign = (field: string, message: string): void => {
      if (message) next[field] = message;
    };

    assign('lastName', this.nameError('lastName', 'Họ'));
    assign('firstName', this.nameError('firstName', 'Tên'));
    assign('gender', this.form.gender ? '' : 'Vui lòng chọn giới tính.');
    assign('birthDate', this.birthDateError());
    assign('bio', this.bioOverLimit ? 'Tiểu sử vượt quá giới hạn 250 ký tự.' : '');

    for (const social of this.socialFields) {
      const value = this.form[social.name];
      const valid = social.host ? isValidSocialLink(value, social.host) : this.isValidPortfolio(value);
      assign(social.name, valid ? '' : 'Đường liên kết không hợp lệ. Vui lòng nhập username hoặc URL đúng cấu trúc.');
    }

    return next;
  }

  private validateField(field: string): void {
    const all = this.validateAll();
    if (all[field]) {
      this.errors[field] = all[field];
    } else {
      delete this.errors[field];
    }
  }

  private validateBio(): void {
    this.validateField('bio');
  }

  private nameError(field: 'lastName' | 'firstName', label: string): string {
    const value = this.form[field].trim();
    if (!value) return `Vui lòng nhập ${label.toLowerCase()}.`;
    if (!isValidPersonName(value)) return `${label} không được chứa số hoặc ký tự đặc biệt.`;
    return '';
  }

  private birthDateError(): string {
    if (!this.form.birthDate.trim()) {
      return 'Vui lòng nhập ngày sinh.';
    }
    return parseBirthDate(this.form.birthDate)
      ? ''
      : 'Ngày sinh không hợp lệ. Vui lòng nhập theo DD/MM/YYYY.';
  }

  private isValidPortfolio(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (/\s/.test(trimmed)) return false;
    if (/^https?:\/\//i.test(trimmed)) {
      return /^https?:\/\/[^\s/]+\.[^\s]{2,}/i.test(trimmed);
    }
    return /^[\p{L}\p{N}._-]+(\.[\p{L}\p{N}._-]+)+(\/[^\s]*)?$/u.test(trimmed);
  }

  private emptyForm(): ProfileFormValue {
    return {
      lastName: '',
      firstName: '',
      gender: '',
      birthDate: '',
      bio: '',
      facebook: '',
      linkedin: '',
      x: '',
      youtube: '',
      github: '',
      portfolio: '',
    };
  }
}
