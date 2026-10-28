import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileService } from '../services/profile.service';
import { UnsavedChangesService } from '../services/unsaved-changes.service';
import { ProfileSidebarComponent } from './components/profile-sidebar/profile-sidebar.component';
import { ProfileFormComponent, ProfileFormValue } from './components/profile-form/profile-form.component';
import { StatusModalComponent } from '../components/status-modal/status-modal.component';
import { UserProfile } from '../../../core/models/profile.model';
import { maskEmail, maskPhone } from '../utils/profile-form.utils';

interface FormStatus {
  dirty: boolean;
  valid: boolean;
  value: ProfileFormValue;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-profile-edit',
  standalone: true,
  imports: [
    CommonModule,
    ProfileSidebarComponent,
    ProfileFormComponent,
    StatusModalComponent,
  ],
  templateUrl: './profile-edit.component.html',
  styleUrl: './profile-edit.component.css'
})
export class ProfileEditComponent {
  readonly profileService = inject(ProfileService);
  readonly unsaved = inject(UnsavedChangesService);

  private readonly router = inject(Router);

  readonly formStatus = signal<FormStatus | null>(null);
  readonly formDirty = computed(() => this.formStatus()?.dirty ?? false);

  readonly avatarPreview = signal<string | null>(null);
  readonly avatarDirty = signal(false);
  readonly avatarError = signal('');
  readonly isUploading = signal(false);

  readonly isSaving = signal(false);
  readonly modal = signal<'success' | 'error' | null>(null);
  readonly allowLeave = signal(false);

  readonly avatarUrl = computed(
    () => this.avatarPreview() ?? this.profileService.profile().avatarUrl
  );

  readonly displayName = computed(() => {
    const value = this.formStatus()?.value;
    if (!value) return this.profileService.profile().name;
    return (
      [value.lastName, value.firstName].filter(Boolean).join(' ').trim() ||
      this.profileService.profile().name
    );
  });

  onFormState(status: FormStatus): void {
    this.formStatus.set(status);
  }

  onSave(value: ProfileFormValue): void {
    if (this.isSaving()) return;

    this.isSaving.set(true);
    const current = this.profileService.profile();
    const payload: Partial<UserProfile> = {
      ...value,
      avatarUrl: this.avatarUrl(),
      maskedEmail: current.maskedEmail || maskEmail(current.email),
      maskedPhone: current.maskedPhone || maskPhone(current.phone),
    };

    this.profileService.updateProfile(payload).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.avatarDirty.set(false);
        this.avatarError.set('');
        this.allowLeave.set(true);
        this.modal.set('success');
      },
      error: () => {
        this.isSaving.set(false);
        this.modal.set('error');
      },
    });
  }

  onCancel(): void {
    void this.router.navigate(['/main/profile']);
  }

  onSuccessClose(): void {
    this.modal.set(null);
    void this.router.navigate(['/main/profile']);
  }

  onErrorClose(): void {
    this.modal.set(null);
  }

  onAvatarSelected(file: File): void {
    this.avatarError.set('');

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      this.avatarError.set('Định dạng ảnh không hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      this.avatarError.set('Dung lượng ảnh vượt quá 2MB. Vui lòng chọn ảnh khác!');
      return;
    }

    this.isUploading.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.avatarPreview.set(reader.result);
        this.avatarDirty.set(true);
      }
      this.isUploading.set(false);
    };
    reader.onerror = () => {
      this.avatarError.set('Không thể đọc tệp ảnh. Vui lòng thử lại.');
      this.isUploading.set(false);
    };
    reader.readAsDataURL(file);
  }

  /** CanDeactivate guard: chặn rời form khi còn thay đổi chưa lưu. */
  canLeave(): boolean | Promise<boolean> {
    if (this.allowLeave() || (!this.formDirty() && !this.avatarDirty())) {
      return true;
    }
    return this.unsaved.confirm();
  }

  onWarningPrimary(): void {
    this.unsaved.resolve(false);
  }

  onWarningSecondary(): void {
    this.unsaved.resolve(true);
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.allowLeave() || (!this.formDirty() && !this.avatarDirty())) return;
    event.preventDefault();
    event.returnValue = '';
  }
}
