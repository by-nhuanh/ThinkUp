import { NgTemplateOutlet } from '@angular/common';
import { finalize } from 'rxjs';
import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DemoRoomSettings, StudyRoomExtras, StudyRoomIdentity } from '../../services/study-room-extras';
import { RoomParticipant, RoomPermissions, StudyRoomService } from '../../services/study-room.service';
import { StudyRoomItem, StudyRoomJoinRequest } from '../../models/study-room.model';
import { LucideCheck, LucideChevronDown, LucideCircleX, LucideCopy, LucideEye, LucideEyeOff, LucidePencil, LucideMic, LucideMicOff, LucideMonitor, LucideSave, LucideSettings, LucideUserPlus, LucideUsers, LucideX } from '@lucide/angular';

export interface RoomTheme { id: string; name: string; src: string; background?: string; grid?: string; type?: string; fit?: string; ambient?: string; }

@Component({ selector: 'app-room-control-panel', standalone: true, imports: [NgTemplateOutlet, LucideCheck, LucideChevronDown, LucideCircleX, LucideCopy, LucideEye, LucideEyeOff, LucidePencil, LucideMic, LucideMicOff, LucideMonitor, LucideSave, LucideSettings, LucideUserPlus, LucideUsers, LucideX], templateUrl: './room-control-panel.component.html', styleUrls: ['../room-glass.css', './room-control-panel.component.css'] })
export class RoomControlPanelComponent implements OnInit {
  private readonly rooms = inject(StudyRoomService);
  readonly extras = inject(StudyRoomExtras);
  readonly roomSettings = computed(() => this.extras.roomSettings(this.roomId()));
  readonly renaming = signal(false);
  readonly renameFeedback = signal('');
  readonly renameError = signal('');
  readonly passwordEditing = signal(false);
  readonly passwordVisible = signal(false);
  readonly savingPassword = signal(false);
  readonly passwordFeedback = signal('');
  readonly passwordError = signal('');

  private currentPassword(): string {
    return this.roleKey() === 'owner' ? this.rooms.readDemoRoomPassword(this.roomId()) ?? '' : '';
  }

  displayedPassword(): string {
    return !this.passwordEditing() && this.passwordVisible() ? this.currentPassword() : '';
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update(visible => !visible);
  }

  editPassword(input: HTMLInputElement): void {
    this.passwordFeedback.set('');
    this.passwordError.set('');
    this.passwordVisible.set(false);
    this.passwordEditing.set(true);
    input.value = '';
    requestAnimationFrame(() => input.focus());
  }

  cancelPasswordEdit(input: HTMLInputElement): void {
    this.passwordEditing.set(false);
    this.passwordVisible.set(false);
    this.passwordError.set('');
    input.value = '';
  }

  async copyPassword(): Promise<void> {
    const password = this.currentPassword();
    this.passwordFeedback.set('');
    this.passwordError.set('');
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      this.passwordFeedback.set('Đã sao chép mật khẩu.');
    } catch {
      this.passwordError.set('Không thể sao chép. Bấm biểu tượng con mắt để xem và sao chép thủ công.');
    }
  }

  savePassword(input: HTMLInputElement): void {
    if (!this.passwordEditing() || this.savingPassword() || this.roleKey() !== 'owner') return;
    const password = input.value;
    if (password.length < 4 || !password.trim()) {
      this.passwordError.set('Mật khẩu mới cần ít nhất 4 ký tự.');
      return;
    }
    this.passwordError.set('');
    this.savingPassword.set(true);
    this.rooms.updateRoomPassword(this.roomId(), password).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.savingPassword.set(false)),
    ).subscribe({
      next: () => {
        this.cancelPasswordEdit(input);
        this.passwordFeedback.set('Đã đổi mật khẩu phòng.');
      },
      error: () => this.passwordError.set('Không thể đổi mật khẩu. Vui lòng thử lại.'),
    });
  }
  private readonly auth = inject(StudyRoomIdentity);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('panel');
  readonly roomId = input.required<string>();
  readonly roomName = input.required<string>();
  readonly requestsOnly = input(false);
  readonly hasCustomBackground = input(false);
  readonly backgroundError = input('');
  readonly uploadBackground = output<File>();

  chooseBackground(picker: HTMLInputElement): void {
    const file = picker.files?.[0];
    picker.value = '';
    if (file && this.canChangeTheme()) this.uploadBackground.emit(file);
  }

  readonly roomInfo = input<StudyRoomItem | null>(null);
  readonly extraTags = computed(() => {
    const room = this.roomInfo();
    return room?.tags.filter(tag => tag.toLowerCase() !== room.category.toLowerCase()).join(', ') ?? '';
  });
  readonly savingDetails = signal(false);
  readonly detailsFeedback = signal('');
  readonly detailsError = signal('');
  readonly memberCount = input.required<number>();
  readonly members = input<RoomParticipant[]>([]);
  readonly joinRequests = input<StudyRoomJoinRequest[]>([]);
  readonly memberName = input.required<string>();
  readonly memberInitials = input.required<string>();
  readonly themes = input.required<readonly RoomTheme[]>();
  readonly selectedTheme = input.required<string>();
  readonly dark = input(false);
  readonly microphones = input<Readonly<Record<string, boolean>>>({});
  readonly feedback = input('');
  readonly activeSection = signal<'members' | 'permissions' | 'appearance'>('members');
  readonly permissionControls: readonly { key: keyof RoomPermissions; label: string }[] = [
    { key: 'voiceEnabled', label: 'Cho phép bật mic' },
    { key: 'cameraEnabled', label: 'Cho phép bật camera' },
    { key: 'chatEnabled', label: 'Cho phép chat' },
    { key: 'participantShareScreen', label: 'Chia sẻ màn hình' },
    { key: 'participantUpload', label: 'Thêm nội dung đa phương tiện' },
    { key: 'whiteboardLocked', label: 'Khóa bảng vẽ' },
  ];
  readonly selectTheme = output<string>();
  readonly close = output<void>();
  readonly invite = output<void>();
  readonly removeMember = output<RoomParticipant>();
  readonly permissionsLoaded = output<RoomPermissions>();
  readonly permissionsChange = output<RoomPermissions>();
  readonly permissions = signal<RoomPermissions>({
    voiceEnabled: false, cameraEnabled: false, chatEnabled: false,
    whiteboardLocked: false, participantShareScreen: false,
    participantUpload: false, approvalRequired: false,
  });
  readonly role = signal('');
  readonly roleKey = signal<'owner' | 'moderator' | 'member'>('member');
  readonly canManage = signal(false);
  readonly canChangeTheme = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly pendingRequests = computed(() => this.joinRequests().filter(request => request.status === 'pending'));
  readonly handlingRequest = signal<{ userId: string; action: 'approve' | 'reject' } | null>(null);
  readonly requestFeedback = signal('');
  readonly requestError = signal('');
  readonly error = signal('');
  readonly matrix = signal<{ feature: string; label: string; owner: boolean; moderator: boolean; member: boolean | string }[]>([]);

  constructor() {
    afterNextRender(() => {
      const panel = this.dialog().nativeElement;
      if (this.requestsOnly()) panel.showPopover();
      else panel.showModal();
    });
  }

  dismiss(): void {
    const panel = this.dialog().nativeElement;
    if (this.requestsOnly()) {
      panel.hidePopover();
      return;
    }
    panel.close();
    this.close.emit();
  }

  onPopoverToggle(panel: HTMLDialogElement): void {
    if (this.requestsOnly() && !panel.matches(':popover-open')) this.close.emit();
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) { this.loading.set(false); this.error.set('Vui lòng đăng nhập để xem quyền phòng.'); return; }
    this.error.set('');
    this.loading.set(true);
    this.rooms.permissions(this.roomId(), userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.permissions.set(result.roomPermissions);
        this.permissionsLoaded.emit(result.roomPermissions);
        this.role.set(result.role === 'owner' ? 'Chủ phòng' : result.role === 'moderator' ? 'Moderator' : 'Thành viên');
        this.roleKey.set(result.role);
        this.canManage.set(result.effectivePermissions.canManagePermissions);
        this.canChangeTheme.set(result.effectivePermissions.canChangeTheme);
        this.matrix.set(result.permissionMatrix);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Không thể tải quyền phòng học.'); },
    });
  }

  applicantInitials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(word => word.slice(0, 1)).join('').toLocaleUpperCase('vi') || 'HV';
  }

  saveRoomDetails(goal: HTMLTextAreaElement, tagsInput: HTMLInputElement): void {
    const room = this.roomInfo();
    if (!room || !this.extras.demo || this.roleKey() !== 'owner' || this.savingDetails()) return;
    this.detailsFeedback.set('');
    this.detailsError.set('');
    const tags = [room.category, ...tagsInput.value.split(',').map(tag => tag.trim())]
      .filter((tag, index, all) => tag && all.findIndex(value => value.toLowerCase() === tag.toLowerCase()) === index);
    this.savingDetails.set(true);
    this.rooms.updateRoomDetails(room.roomId, { goal: goal.value.trim(), tags }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.savingDetails.set(false)),
    ).subscribe({
      next: () => {
        this.detailsFeedback.set('Đã lưu thông tin phòng.');
      },
      error: () => this.detailsError.set('Không thể lưu thông tin phòng. Vui lòng thử lại.'),
    });
  }

  renameRoom(input: HTMLInputElement): void {
    if (!this.extras.demo || this.roleKey() !== 'owner' || this.renaming()) return;
    const name = input.value.trim();
    this.renameFeedback.set('');
    this.renameError.set('');
    if (name.length < 5 || name.length > 80) {
      this.renameError.set('Tên phòng cần từ 5 đến 80 ký tự.');
      return;
    }
    if (name === this.roomName()) {
      this.renameFeedback.set('Tên phòng đang dùng.');
      return;
    }
    this.renaming.set(true);
    this.rooms.renameRoom(this.roomId(), name).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.renaming.set(false)),
    ).subscribe({
      next: updated => {
        input.value = updated.name;
        this.renameFeedback.set('Đã đổi tên phòng.');
      },
      error: () => this.renameError.set('Không thể đổi tên phòng. Vui lòng thử lại.'),
    });
  }

  toggleRoomOption(key: keyof DemoRoomSettings): void {
    if (this.extras.demo && this.roleKey() === 'owner') {
      this.extras.updateRoomSettings(this.roomId(), { [key]: !this.roomSettings()[key] });
    }
  }

  toggle(key: keyof RoomPermissions): void {
    if (!this.canManage() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.rooms.updatePermissions(this.roomId(), { [key]: !this.permissions()[key] }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { this.permissions.set(updated); this.permissionsChange.emit(updated); this.saving.set(false); },
      error: () => { this.saving.set(false); this.error.set('Không thể cập nhật quyền phòng. Vui lòng thử lại.'); },
    });
  }

  decideRequest(request: StudyRoomJoinRequest, action: 'approve' | 'reject', focusTarget: HTMLElement): void {
    if (this.loading() || this.roleKey() !== 'owner' || this.handlingRequest() ||
      !this.pendingRequests().some(candidate => candidate.userId === request.userId)) return;

    const name = request.userName || 'học viên';
    this.handlingRequest.set({ userId: request.userId, action });
    this.requestError.set('');
    this.requestFeedback.set('');
    focusTarget.focus({ preventScroll: true });
    this.rooms.handleJoinRequest(this.roomId(), request.userId, action).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.handlingRequest.set(null)),
    ).subscribe({
      next: () => this.requestFeedback.set(action === 'approve'
        ? `Đã duyệt yêu cầu của ${name}.`
        : `Đã từ chối yêu cầu của ${name}.`),
      error: () => this.requestError.set(`Không thể xử lý yêu cầu của ${name}. Vui lòng thử lại.`),
    });
  }
}
