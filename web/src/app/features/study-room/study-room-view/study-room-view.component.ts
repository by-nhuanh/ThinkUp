import { firstValueFrom } from 'rxjs';
import { createRoomTimer, finishTimer, readRoomTimer, RoomTimer, TimerMode, TimerScope, timerRemaining } from '../services/study-room-timer';
import { RoomInviteDialogComponent } from '../components/room-invite-dialog/room-invite-dialog.component';
import { CanvasImageDialogComponent, CanvasImageSource } from '../components/canvas-image-dialog/canvas-image-dialog.component';
import { studyRoomMediaProviders } from '../services/study-room-media.providers';
import { afterNextRender, afterRenderEffect, WritableSignal, Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OwnerDeparture, RoomMessage, RoomParticipant, RoomPermissions, StudyRoomService } from '../services/study-room.service';
import { StudyRoomItem } from '../models/study-room.model';
import { LucideCheck, LucideChevronDown, LucideClock, LucideX, LucideBedDouble, LucideBell, LucideCoffee, LucideLayers, LucidePause, LucidePlay, LucideTarget, LucideCopy, LucidePanelRight, LucidePlus, LucideMinus, LucideLocateFixed, LucideMic, LucideMicOff, LucideVideo, LucideVideoOff, LucideScreenShare, LucideMousePointer2, LucideSmile, LucideMessageCircle, LucideSettings, LucideLogOut, LucideHeadphones, LucideRotateCcw, LucideCrown, LucideShieldCheck, LucideUserRound, LucideUserPlus, LucideAudioLines } from '@lucide/angular';
import { AddToCanvasMenuComponent, CanvasItemKind, NewCanvasItemKind } from '../components/add-to-canvas-menu/add-to-canvas-menu.component';
import { CanvasItem, CanvasItemComponent } from '../components/canvas-item/canvas-item.component';
import { LofiPlayerComponent } from '../components/lofi-player/lofi-player.component';
import { RoomControlPanelComponent } from '../components/room-control-panel/room-control-panel.component';
import { PIXEL_DREAMLAND_MEDIA } from '../data/study-room-media';
import { ReactionPickerComponent } from '../components/reaction-picker/reaction-picker.component';
import { RemoteScreenStream, RoomRealtimeEnvelope, StudyRoomMediaService } from '../services/study-room-media.service';
import { StudyRoomExtras, StudyRoomIdentity } from "../services/study-room-extras";
import { ChatPanelComponent, RoomChatMessage } from '../components/chat-panel/chat-panel.component';
import { ParticipantPopoverComponent } from '../components/participant-popover/participant-popover.component';

interface FloatingReaction { id: string; emoji: string; x: number; y: number; }
interface MiniMapRect { x: number; y: number; width: number; height: number; kind: 'item' | 'member' | 'timer' | 'viewport'; }
interface MiniMapModel { bounds: { left: number; top: number }; scale: number; offsetX: number; offsetY: number; rects: MiniMapRect[]; }
interface ScreenLayout { active: boolean; x: number; y: number; width: number; height: number; }

@Component({
  selector: 'app-study-room-view',
  standalone: true,
  providers: studyRoomMediaProviders,
  imports: [CommonModule, FormsModule, CanvasImageDialogComponent, RoomInviteDialogComponent, AddToCanvasMenuComponent, CanvasItemComponent, LofiPlayerComponent, RoomControlPanelComponent, ReactionPickerComponent, ChatPanelComponent, ParticipantPopoverComponent, LucideCheck, LucideChevronDown, LucideClock, LucideX, LucideBedDouble, LucideBell, LucideCoffee, LucideLayers, LucidePause, LucidePlay, LucideTarget, LucideCopy, LucidePanelRight, LucidePlus, LucideMinus, LucideLocateFixed, LucideMic, LucideMicOff, LucideVideo, LucideVideoOff, LucideScreenShare, LucideMousePointer2, LucideSmile, LucideMessageCircle, LucideSettings, LucideLogOut, LucideHeadphones, LucideRotateCcw, LucideCrown, LucideShieldCheck, LucideUserRound, LucideUserPlus, LucideAudioLines],
  templateUrl: './study-room-view.component.html',
  styleUrls: ['../components/room-glass.css', './study-room-view.component.css']
})
export class StudyRoomViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly studyRoomService = inject(StudyRoomService);
  private readonly auth = inject(StudyRoomIdentity);
  readonly extras = inject(StudyRoomExtras);
  private readonly media = inject(StudyRoomMediaService);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('localVideo') localVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('screenVideo') screenVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteMedia') set remoteMediaHost(host: ElementRef<HTMLDivElement> | undefined) {
    if (host) this.media.setRemoteHost(host.nativeElement);
  }

  readonly roomId = signal<string>('');
  readonly member = {
    name: this.auth.currentUser()?.full_name || 'Học viên',
    initials: (this.auth.currentUser()?.full_name || 'HV').split(' ').map(part => part[0]).slice(-2).join('').toUpperCase(),
    avatar: this.auth.currentUser()?.avatar || '',
  };
  readonly memberPosition = signal({ x: 300, y: 250 });
  readonly memberZ = signal(10);
  readonly timerPosition = signal({ x: 50, y: 600 });
  readonly screenPosition = signal({ x: 400, y: 180 });
  readonly screenSize = signal({ width: 640, height: 360 });
  readonly pan = signal({ x: 0, y: 0 });
  readonly roleLabel = signal('Thành viên');
  readonly currentRole = signal<'owner' | 'moderator' | 'member'>('member');
  readonly sessionError = signal('');
  readonly notice = signal('');
  readonly inviteOpen = signal(false);
  readonly inviteFeedback = signal('');
  readonly inviteLink = computed(() => {
    const route = this.router.createUrlTree(['/learning/study-room', this.roomId()]);
    return new URL(this.router.serializeUrl(route), location.origin).href;
  });
  readonly participants = signal<RoomParticipant[]>([]);
  readonly timerModes: readonly { key: TimerMode; label: string }[] = [
    { key: 'focus', label: 'Tập trung' }, { key: 'break', label: 'Nghỉ ngắn' }, { key: 'long-break', label: 'Nghỉ dài' },
  ];
  readonly timerScopes: readonly { key: TimerScope; label: string }[] = [
    { key: 'personal', label: 'Cá nhân' }, { key: 'group', label: 'Cả phòng' },
  ];
  readonly timerScopeMenuOpen = signal(false);
  @ViewChild('timerDockButton') private timerDockButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('timerScopeTrigger') private timerScopeTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('timerScopeMenu') private timerScopeMenu?: ElementRef<HTMLElement>;
  readonly timerScope = signal<TimerScope>('personal');
  readonly timers = signal<Record<TimerScope, RoomTimer>>({ personal: createRoomTimer(), group: createRoomTimer() });
  readonly activeTimer = computed(() => this.timers()[this.timerScope()]);
  readonly timerMode = computed(() => this.activeTimer().mode);
  readonly timeLeft = computed(() => timerRemaining(this.activeTimer(), this.timerNow()));
  readonly isRunning = computed(() => this.activeTimer().endsAt !== null);
  readonly groupChatPaused = computed(() => {
    const timer = this.timers().group;
    return this.currentRole() === 'member' && this.extras.roomSettings(this.roomId()).pauseChat &&
      timer.mode === 'focus' && timer.endsAt !== null;
  });
  readonly canEditTimer = computed(() => this.timerScope() === 'personal' || this.currentRole() !== 'member');
  readonly timerOpen = signal(false);
  readonly timerSettingsOpen = signal(false);
  readonly hideTimerCount = signal(false);
  readonly timerSound = signal<'off' | 'chime' | 'soft'>('chime');
  readonly timerVolume = signal(.5);
  private readonly timerNow = signal(Date.now());
  private timerAudio?: AudioContext;
  readonly memberCount = computed(() => this.participants().length);
  readonly controlOpen = signal(false);
  readonly chatOpen = signal(false);
  readonly chatPosition = signal<{ x: number; y: number } | null>(null);
  readonly unreadChatCount = signal(0);
  readonly customBackground = signal('');
  readonly backgroundError = signal('');
  private backgroundRequest = 0;
  readonly chatDraft = signal('');
  readonly sendingMessage = signal(false);
  readonly leaveOpen = signal(false);
  readonly micOn = this.media.micOn;
  readonly camOn = this.media.camOn;
  readonly addOpen = signal(false);
  readonly imageOpen = signal(false);
  readonly emojiOpen = signal(false);
  readonly reactions = signal<FloatingReaction[]>([]);
  readonly lofiOpen = signal(false);
  readonly lofiPlaying = signal(false);
  readonly sharingScreen = this.media.sharingScreen;
  readonly remoteScreens = this.media.remoteScreens;
  readonly mediaError = this.media.error;
  readonly canvasItems = signal<CanvasItem[]>([]);
  readonly selectedItemId = signal<string | null>(null);
  readonly selectedParticipantId = signal<string | null>(null);
  readonly localAvatarFailed = signal(false);
  readonly failedAvatarIds = signal<ReadonlySet<string>>(new Set());
  readonly remoteCursors = signal<Record<string, { x: number; y: number; name: string; color: string }>>({});
  readonly remoteMediaStates = signal<Record<string, { micOn: boolean; camOn: boolean }>>({});
  readonly remoteScreenLayouts = signal<Record<string, ScreenLayout>>({});
  readonly zoom = signal(100);
  readonly viewportSize = signal({ width: window.innerWidth, height: window.innerHeight });
  readonly roomPermissions = signal<RoomPermissions>({
    voiceEnabled: false, cameraEnabled: false, chatEnabled: false,
    whiteboardLocked: true, participantShareScreen: false,
    participantUpload: false, approvalRequired: false,
  });
  readonly selectedTheme = signal('white');
  readonly themes = [
    { id: 'white', name: 'Trắng mặc định', src: '', background: '#ffffff', grid: 'rgba(148,163,184,.34)', type: 'gradient' },
    { id: 'minimal', name: 'Minimal', src: '', background: 'linear-gradient(135deg,#f8fafc,#e0f2fe 48%,#fefce8)', grid: 'rgba(148,163,184,.46)', type: 'gradient' },
    { id: 'coffee', name: 'Coffee Shop', src: '', background: 'linear-gradient(135deg,#fff7ed,#fed7aa 42%,#bae6fd)', grid: 'rgba(180,83,9,.25)', type: 'gradient', ambient: 'Cafe noise' },
    { id: 'library', name: 'Library', src: '', background: 'linear-gradient(135deg,#f5f3ff,#ddd6fe 46%,#fef3c7)', grid: 'rgba(124,58,237,.24)', type: 'gradient', ambient: 'Library noise' },
    { id: 'night', name: 'Night Owl', src: '', background: 'radial-gradient(circle at top left,#1e3a8a,#0f172a 38%,#111827)', grid: 'rgba(125,211,252,.26)', type: 'gradient', ambient: 'Night rain' },
    { id: 'nature', name: 'Zen Garden', src: '', background: 'linear-gradient(135deg,#ecfccb,#bbf7d0 44%,#bae6fd)', grid: 'rgba(22,163,74,.25)', type: 'gradient', ambient: 'Forest stream' },
    { id: 'space', name: 'Space Lab', src: '', background: 'radial-gradient(circle at 20% 20%,#4338ca,#111827 36%,#020617)', grid: 'rgba(196,181,253,.24)', type: 'gradient', ambient: 'Deep ambient' },
    { id: 'lofi-night', name: 'Lofi Night', src: 'https://i.pinimg.com/originals/55/fc/4b/55fc4bee7c31f0850262da53fa1e3180.gif', background: '#16091f', ambient: 'Lofi room' },
    { id: 'sky-room', name: 'Sky Room', src: 'https://i.pinimg.com/originals/05/3e/50/053e50e89442c41be8b9f10df1c1250f.gif', fit: 'contain', background: '#e0f7ff', ambient: 'Soft wind' },
    { id: 'cloud-window', name: 'Cloud Window', src: 'https://i.pinimg.com/originals/9a/a3/5e/9aa35edded370761aff4065510146b56.gif', background: '#dff6ff', ambient: 'Soft breeze' },
    { id: 'cozy-window', name: 'Cozy Window', src: 'https://i.pinimg.com/originals/41/f7/72/41f7728ec0b73ee02e86cad71292f90b.gif', background: '#1d1530', ambient: 'Quiet room' },
    { id: 'pragmata-horizon', name: 'Pragmata Horizon', src: 'https://motionbgs.com/media/9514/pragmata-horizon.960x540.mp4', background: '#07111f', grid: '', type: 'video', ambient: 'Space wind' },
    { id: 'cherry-blossom-tree', name: 'Cherry Blossom Tree', src: 'https://motionbgs.com/media/9121/large-cherry-blossom-tree.960x540.mp4', background: '#fee2f0', grid: '', type: 'video', ambient: 'Spring wind' },
    { id: 'genshin-impact', name: 'Genshin Impact', src: 'https://genshin.hoyoverse.com/_nuxt/videos/bg.3e78e80.mp4', background: '#0f172a', grid: '', type: 'video', ambient: 'Genshin BGM' },
    { id: 'pixel-dreamland', name: 'Pixel Dreamland', src: PIXEL_DREAMLAND_MEDIA, background: '#2a1238', grid: '', type: 'image', ambient: 'Dream loop' },
    { id: 'pixel-skyline', name: 'Pixel Skyline', src: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/618395ed-3302-4408-bcd8-4ce51cc8b364/deu0y55-b42b6713-150e-402c-a975-3b63e9f604b8.gif?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiIvZi82MTgzOTVlZC0zMzAyLTQ0MDgtYmNkOC00Y2U1MWNjOGIzNjQvZGV1MHk1NS1iNDJiNjcxMy0xNTBlLTQwMmMtYTk3NS0zYjYzZTlmNjA0YjguZ2lmIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.CZ994VGfFJwCat43jdDgN7SUu_Jim0wbHjBnv2ttBWw', background: '#082f49', type: 'image', ambient: 'City loop' },
    { id: 'pixel-quiet-night', name: 'Pixel Quiet Night', src: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/618395ed-3302-4408-bcd8-4ce51cc8b364/deoioou-d38e35ff-bf55-4160-835a-dec07338a5fe.gif?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiIvZi82MTgzOTVlZC0zMzAyLTQ0MDgtYmNkOC00Y2U1MWNjOGIzNjQvZGVvaW9vdS1kMzhlMzVmZi1iZjU1LTQxNjAtODM1YS1kZWMwNzMzOGE1ZmUuZ2lmIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.eFiIuQVeJVBzV05DW6RYJjlY6CatDJaLAYi12HAKu1c', background: '#111827', type: 'image', ambient: 'Night loop' },
    { id: 'thinkup-clean', name: 'ThinkUp Clean', src: '/assets/study-room/lobby-background-clean.png', background: '#ffffff', grid: '', type: 'image' },
    { id: 'anime-room', name: 'Anime Room', src: 'https://i.pinimg.com/originals/14/ae/7e/14ae7ede205573466d68eb3a562fe349.gif', background: '#071866', ambient: 'Night room' },
    { id: 'cozy-rainy-window', name: 'Cửa sổ mưa lofi', src: 'https://i.pinimg.com/originals/cc/95/db/cc95db51995bf889d8f2217955c2ec1e.gif', background: '#110d24', ambient: 'Soft rain lofi' },
  ];
  readonly participantMicrophones = computed(() => Object.fromEntries(
    this.participants().map(person => [person.userId, person.isSelf ? this.micOn() : this.remoteMicOn(person.userId)]),
  ));
  readonly activeTheme = computed(() => this.themes.find(item => item.id === this.selectedTheme()) || this.themes[0]);
  readonly isDarkTheme = computed(() => ['night', 'space', 'lofi-night', 'cozy-window', 'pragmata-horizon', 'genshin-impact', 'pixel-dreamland', 'pixel-skyline', 'pixel-quiet-night', 'anime-room', 'cozy-rainy-window'].includes(this.selectedTheme()));
  readonly background = computed(() => this.customBackground() ? `url('${this.customBackground()}') center / cover no-repeat #182134` : this.activeTheme().src && this.activeTheme().type !== 'video' ? `url('${this.activeTheme().src}') center / ${this.activeTheme().fit || 'cover'} no-repeat ${this.activeTheme().background || ''}` : this.activeTheme().background);
  readonly grid = computed(() => this.activeTheme().type === 'gradient' ? `radial-gradient(${this.activeTheme().grid} 1.5px, transparent 1.5px)` : 'none');
  readonly gridSize = computed(() => 24 * this.zoom() / 100);
  readonly gridPosition = computed(() => {
    const size = this.gridSize();
    return `${this.pan().x % size}px ${this.pan().y % size}px`;
  });
  readonly miniMapModel = computed<MiniMapModel>(() => this.buildMiniMapModel());

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private roomPollInterval: ReturnType<typeof setInterval> | null = null;
  private hasJoined = false;
  readonly leaving = signal(false);
  readonly departureChoice = signal<'close' | 'auto' | 'manual' | ''>('');
  readonly successorId = signal('');
  readonly successorName = computed(() => {
    const member = this.eligibleSuccessors().find(candidate => candidate.userId === this.successorId());
    return member?.displayName || member?.name || '';
  });
  readonly departureError = signal('');
  readonly eligibleSuccessors = computed(() => this.participants().filter(member => !member.isSelf && member.userId !== this.auth.currentUser()?.id));
  private remoteAvatarGesture?: { userId: string; pointerId: number; startX: number; startY: number; origin: { x: number; y: number }; moved: boolean };
  private suppressAvatarClick?: string;
  private readonly liveParticipantPositions = new Map<string, { x: number; y: number }>();
  private canvasGesture: {
    kind: 'pan' | 'member' | 'timer' | 'screen' | 'screen-resize'; pointerId: number;
    startX: number; startY: number; originX: number; originY: number;
  } | null = null;
  private lastCursorSentAt = 0;
  private lastPositionSentAt = 0;
  private lastScreenStateSentAt = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private miniMapDragging = false;
  private roomTransition = 0;
  private positionSave = Promise.resolve();
  private readonly disconnectedParticipantIds = new Set<string>();

  readonly requestsOnly = signal(false);
  readonly pendingRequestCount = computed(() =>
    this.room()?.joinRequests?.filter(request => request.status === 'pending').length ?? 0);

  readonly roomName = computed(() => this.room()?.name.trim() || 'Phòng học ảo');
  readonly room = computed(() => {
    const id = this.roomId();
    return id ? this.studyRoomService.getJoinedRoom(id) : null;
  });

  readonly formattedTime = computed(() => {
    const total = this.timeLeft();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  readonly messages = signal<RoomChatMessage[]>([]);

  ngOnInit(): void {
    this.media.setRealtimeHandler((event, senderId) => this.applyRealtimeEvent(event, senderId));
    this.media.setScreenEndedHandler(() => this.broadcastScreenState(false));
    this.media.setTrackStateHandler((participantId, state) => {
      if (participantId === this.auth.currentUser()?.id) {
        this.broadcastMediaState();
        return;
      }
      this.remoteMediaStates.update(states => ({
        ...states,
        [participantId]: { micOn: state.micOn ?? states[participantId]?.micOn ?? false, camOn: state.camOn ?? states[participantId]?.camOn ?? false },
      }));
    });
    this.media.setParticipantDisconnectedHandler(participantId => {
      this.disconnectedParticipantIds.add(participantId);
      this.removeParticipantState(participantId);
    });
    this.media.setParticipantConnectedHandler(participantId => {
      this.disconnectedParticipantIds.delete(participantId);
      if (this.hasJoined) this.refreshRoomData();
    });
    this.media.setReconnectedHandler(() => {
      this.disconnectedParticipantIds.clear();
      this.refreshRoomData(() => this.requestRoomSync());
      this.loadPermissions();
      this.broadcastMediaState();
      if (this.sharingScreen()) this.broadcastScreenState(true);
    });
    this.timerInterval = setInterval(() => this.tickTimers(), 250);
    this.timerPosition.set({ x: 50, y: Math.min(600, Math.max(144, this.viewportSize().height - 280)) });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('roomId') || '';
      void this.transitionToRoom(id);
    });
  }

  private async transitionToRoom(id: string): Promise<void> {
    if (id && id === this.roomId() && this.hasJoined) return;
    const transition = ++this.roomTransition;
    if (this.roomPollInterval) clearInterval(this.roomPollInterval);
    this.roomPollInterval = null;
    const previousId = this.roomId();
    if (previousId && previousId !== id && this.hasJoined) {
      const userId = this.auth.currentUser()?.id;
      this.hasJoined = false;
      this.studyRoomService.clearJoinedRoom(previousId);
      if (userId) this.studyRoomService.leaveRoom(previousId, userId).subscribe({ error: () => { /* Continue switching rooms even if cleanup fails. */ } });
      await this.media.dispose();
      if (transition !== this.roomTransition) return;
    }
    if (previousId && previousId !== id) this.resetRoomState();
    this.leaving.set(false);
    this.roomId.set(id);
    this.selectedTheme.set('white');
    this.clearCustomBackground();
    this.backgroundError.set('');
    this.openRoom(id, transition);
  }

  private resetRoomState(): void {
    this.timers.update(timers => ({ ...timers, group: createRoomTimer() }));
    this.timerOpen.set(false);
    this.timerSettingsOpen.set(false);
    this.sessionError.set('');
    this.notice.set('');
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(100);
    this.participants.set([]);
    this.messages.set([]);
    this.chatPosition.set(null);
    this.unreadChatCount.set(0);
    this.canvasItems.set([]);
    this.remoteCursors.set({});
    this.remoteMediaStates.set({});
    this.remoteScreenLayouts.set({});
    this.selectedItemId.set(null);
    this.closeRoomPanels();
    this.chatDraft.set('');
    this.sendingMessage.set(false);
    this.imageOpen.set(false);
    this.inviteOpen.set(false);
    this.leaveOpen.set(false);
    this.disconnectedParticipantIds.clear();
    this.liveParticipantPositions.clear();
    this.remoteAvatarGesture = undefined;
    this.suppressAvatarClick = undefined;
  }

  @HostListener('window:resize')
  updateViewportSize(): void {
    this.viewportSize.set({ width: window.innerWidth, height: window.innerHeight });
  }

  private openRoom(id: string, transition: number): void {
    if (!id) { this.sessionError.set('Mã phòng không hợp lệ.'); return; }
    const joinedRoom = this.studyRoomService.getJoinedRoom(id);
    if (joinedRoom) { this.applyRoomTheme(joinedRoom); this.connectRoom(id, transition); return; }
    this.studyRoomService.joinRoom(id).subscribe({
      next: room => {
        if (!this.isCurrentRoomTransition(id, transition)) {
          if (this.roomId() !== id) this.studyRoomService.clearJoinedRoom(id);
          return;
        }
        this.applyRoomTheme(room);
        this.connectRoom(id, transition);
      },
      error: () => {
        if (this.isCurrentRoomTransition(id, transition)) this.sessionError.set('Không thể xác thực phòng này. Vui lòng quay lại sảnh và vào phòng bằng mã hoặc mật khẩu.');
      },
    });
  }

  private applyRoomTheme(room: StudyRoomItem): void {
    if (this.themes.some(theme => theme.id === room.theme)) this.selectedTheme.set(room.theme);
  }

  private connectRoom(id: string, transition: number): void {
    const user = this.auth.currentUser();
    if (!user) { this.sessionError.set('Vui lòng đăng nhập để vào phòng học.'); return; }
    this.studyRoomService.connection(id, user.id, user.full_name).subscribe({
      next: async connection => {
        if (!this.isCurrentRoomTransition(id, transition)) { this.cleanupStaleConnection(id, user.id); return; }
        this.currentRole.set(connection.role);
        this.roleLabel.set(connection.role === 'owner' ? 'Chủ phòng' : connection.role === 'moderator' ? 'Moderator' : 'Thành viên');
        if (connection.theme) this.applyRoomTheme({ theme: connection.theme } as StudyRoomItem);
        this.loadPermissions();
        try {
          await this.media.connect(connection);
          if (!this.isCurrentRoomTransition(id, transition)) {
            this.cleanupStaleConnection(id, user.id);
            return;
          }
          this.hasJoined = true;
          this.roleLabel.set(connection.role === 'owner' ? 'Chủ phòng' : connection.role === 'moderator' ? 'Moderator' : 'Thành viên');
          this.currentRole.set(connection.role);
          this.memberPosition.set(connection.position);
          this.sessionError.set('');
          this.refreshRoomData(() => this.requestRoomSync());
          this.loadPermissions();
          this.roomPollInterval = setInterval(() => this.refreshRoomData(), 5000);
        } catch {
          if (!this.isCurrentRoomTransition(id, transition)) return;
          this.studyRoomService.leaveRoom(id, user.id).subscribe({ error: () => { /* The connection error remains the actionable message. */ } });
          this.sessionError.set(this.media.error() || 'Không thể kết nối phòng học trực tuyến. Vui lòng thử lại.');
        }
      },
      error: () => {
        if (this.isCurrentRoomTransition(id, transition)) this.sessionError.set('Không thể tạo phiên phòng học. Vui lòng thử lại.');
      },
    });
  }

  private isCurrentRoomTransition(id: string, transition: number): boolean {
    return transition === this.roomTransition && id === this.roomId();
  }

  private cleanupStaleConnection(roomId: string, userId: string): void {
    if (this.roomId() === roomId) return;
    this.studyRoomService.clearJoinedRoom(roomId);
    this.studyRoomService.leaveRoom(roomId, userId).subscribe({ error: () => { /* A stale room must not affect the active room. */ } });
  }

  private refreshRoomData(afterParticipants?: () => void): void {
    const id = this.roomId();
    const userId = this.auth.currentUser()?.id;
    if (!id || !userId) return;
    this.studyRoomService.participants(id, userId).subscribe({
      next: members => {
        if (id !== this.roomId()) return;
        const connectedMembers = members.filter(member => !this.disconnectedParticipantIds.has(member.userId));
        this.participants.set(connectedMembers.map(member => {
          const position = this.liveParticipantPositions.get(member.userId);
          return position ? { ...member, position } : member;
        }));
        const activeIds = new Set(connectedMembers.map(member => member.userId));
        this.remoteCursors.update(cursors => Object.fromEntries(Object.entries(cursors).filter(([memberId]) => activeIds.has(memberId))));
        this.remoteMediaStates.update(states => Object.fromEntries(Object.entries(states).filter(([memberId]) => activeIds.has(memberId))));
        this.remoteScreenLayouts.update(layouts => Object.fromEntries(Object.entries(layouts).filter(([memberId]) => activeIds.has(memberId))));
        afterParticipants?.();
      },
      error: () => { if (id === this.roomId()) this.showNotice('Không thể đồng bộ thành viên phòng.'); },
    });
    this.studyRoomService.messages(id, userId).subscribe({
      next: messages => {
        if (id !== this.roomId()) return;
        const incoming = messages.map(message => this.mapMessage(message, userId));
        this.messages.update(current => this.mergeMessages(incoming, current));
      },
      error: () => { if (id === this.roomId()) this.showNotice('Không thể đồng bộ tin nhắn phòng.'); },
    });
  }

  private requestRoomSync(): void {
    void this.media.sendRealtime({ type: 'sync-request', payload: null });
  }

  private loadPermissions(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    const roomId = this.roomId();
    this.studyRoomService.permissions(roomId, userId).subscribe({
      next: result => { if (roomId === this.roomId()) { this.currentRole.set(result.role); this.roleLabel.set(result.role === 'owner' ? 'Chủ phòng' : result.role === 'moderator' ? 'Moderator' : 'Thành viên'); this.applyLoadedPermissions(result.roomPermissions); } },
      error: () => { if (roomId === this.roomId()) this.showNotice('Không thể đồng bộ quyền tương tác trong phòng.'); },
    });
  }

  private mapMessage(message: RoomMessage, userId: string): RoomChatMessage {
    const date = new Date(message.createdAt);
    const sender = message.senderName || 'Thành viên';
    const palette = ['#64748b', '#714cb6', '#3559b8', '#2daa6e', '#e05297', '#b45309'];
    const colorIndex = [...sender].reduce((total, character) => total + character.charCodeAt(0), 0) % palette.length;
    return { id: message.id, senderId: message.senderId, sender, text: message.content,
      time: Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      initials: sender.split(' ').filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase() || 'U', color: palette[colorIndex],
      isMe: message.senderId === userId };
  }

  ngOnDestroy(): void {
    this.clearCustomBackground();
    if (this.timerInterval) clearInterval(this.timerInterval);
    void this.timerAudio?.close();
    if (this.roomPollInterval) clearInterval(this.roomPollInterval);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    void this.media.dispose();
    if (this.hasJoined && !this.leaving) {
      const userId = this.auth.currentUser()?.id;
      if (userId) this.studyRoomService.leaveRoom(this.roomId(), userId).subscribe({ error: () => { /* Component teardown must remain silent. */ } });
    }
  }

  toggleTimer(): void {
    if (!this.canEditTimer()) return;
    this.unlockTimerAudio();
    const now = Date.now();
    this.timerNow.set(now);
    const timer = this.activeTimer();
    const timeLeft = timerRemaining(timer, now) || timer.durations[timer.mode] * 60;
    this.updateTimer({ ...timer, timeLeft, endsAt: timer.endsAt === null ? now + timeLeft * 1000 : null });
  }

  resetTimer(): void { this.setTimerMode(this.timerMode()); }

  setTimerMode(mode: TimerMode): void {
    if (!this.canEditTimer()) return;
    const timer = this.activeTimer();
    this.updateTimer({ ...timer, mode, timeLeft: timer.durations[mode] * 60, endsAt: null });
  }

  setTimerMinutes(mode: TimerMode, input: HTMLInputElement): void {
    if (!this.canEditTimer()) return;
    const timer = this.activeTimer();
    const minutes = input.valueAsNumber;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      input.value = String(timer.durations[mode]);
      return;
    }
    const durations = { ...timer.durations, [mode]: minutes };
    const timeLeft = timer.mode === mode && timer.endsAt === null ? minutes * 60 : timer.timeLeft;
    this.updateTimer({ ...timer, durations, timeLeft });
  }

  setTimerAutoAdvance(value: boolean): void {
    if (this.canEditTimer()) this.updateTimer({ ...this.activeTimer(), autoAdvance: value });
  }

  openTimerScopeMenu(): void {
    this.timerScopeMenu?.nativeElement.showPopover();
  }

  onTimerScopeMenuToggle(): void {
    const menu = this.timerScopeMenu?.nativeElement;
    const open = !!menu?.matches(':popover-open');
    this.timerScopeMenuOpen.set(open);
    if (!open) return;
    this.positionTimerScopeMenu();
    menu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  selectTimerScope(scope: TimerScope): void {
    this.timerScope.set(scope);
    this.closeTimerScopeMenu();
  }

  onTimerScopeMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeTimerScopeMenu();
      return;
    }
    if (event.key === 'Tab') {
      this.closeTimerScopeMenu();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(this.timerScopeMenu?.nativeElement.querySelectorAll('button') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowUp' ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + step + items.length) % items.length;
    items[next].focus();
  }

  positionTimerScopeMenu(): void {
    const menu = this.timerScopeMenu?.nativeElement;
    const trigger = this.timerScopeTrigger?.nativeElement;
    if (!menu?.matches(':popover-open') || !trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const { width, height } = this.viewportSize();
    const margin = 12;
    const gap = 6;
    const below = height - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    const openAbove = below < menu.scrollHeight && above > below;
    menu.style.maxHeight = `${Math.max(0, openAbove ? above : below)}px`;
    const size = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(margin, Math.min(anchor.left, width - size.width - margin))}px`;
    menu.style.top = `${Math.max(margin, openAbove ? anchor.top - gap - size.height : anchor.bottom + gap)}px`;
  }

  private closeTimerScopeMenu(): void {
    this.timerScopeMenu?.nativeElement.hidePopover();
    this.timerScopeTrigger?.nativeElement.focus({ preventScroll: true });
  }

  toggleTimerWidget(): void {
    this.timerOpen.update(open => !open);
    if (!this.timerOpen()) { this.timerScopeMenuOpen.set(false); return; }
    requestAnimationFrame(() => {
      if (!this.timerOpen()) return;
      this.positionOverlays();
      this.fitTimerInViewport();
      this.pomodoroWidget?.nativeElement.querySelector<HTMLButtonElement>('.timer-scope')?.focus({ preventScroll: true });
    });
  }

  closeTimerWidget(): void {
    this.timerOpen.set(false);
    this.timerScopeMenuOpen.set(false);
    this.timerDockButton?.nativeElement.focus({ preventScroll: true });
  }

  toggleTimerSettings(): void {
    this.timerSettingsOpen.update(open => !open);
    if (this.timerSettingsOpen()) requestAnimationFrame(() => this.fitTimerInViewport());
  }

  private fitTimerInViewport(): void {
    const widget = this.pomodoroWidget?.nativeElement;
    if (!widget || !this.timerOpen()) return;
    const scale = this.zoom() / 100;
    const pan = this.pan();
    const viewport = this.viewportSize();
    const dockTop = this.roomDock?.nativeElement.getBoundingClientRect().top ?? viewport.height - 96;
    const rect = widget.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, viewport.width - rect.width - 12));
    const top = Math.max(12, Math.min(rect.top, dockTop - rect.height - 8));
    this.timerPosition.set({ x: (left - pan.x) / scale, y: (top - pan.y) / scale });
  }

  setTimerSound(sound: 'off' | 'chime' | 'soft'): void {
    this.timerSound.set(sound);
    this.unlockTimerAudio();
  }

  private updateTimer(timer: RoomTimer): void {
    const scope = this.timerScope();
    this.timers.update(timers => ({ ...timers, [scope]: timer }));
    if (scope === 'group') this.broadcastTimer();
  }

  private tickTimers(): void {
    const now = Date.now();
    const timers = this.timers();
    if (timers.personal.endsAt === null && timers.group.endsAt === null) return;
    this.timerNow.set(now);
    for (const scope of ['personal', 'group'] as const) {
      const timer = timers[scope];
      if (timer.endsAt === null || timer.endsAt > now) continue;
      this.timers.update(current => ({ ...current, [scope]: finishTimer(timer, now) }));
      if (scope === 'group' && this.currentRole() === 'owner') this.broadcastTimer();
      if (scope === this.timerScope()) {
        this.playTimerSound();
        this.showNotice(timer.mode === 'focus' ? 'Đã hoàn thành phiên tập trung.' : 'Đã hết giờ nghỉ.');
      }
    }
  }

  private unlockTimerAudio(): void {
    if (this.timerSound() === 'off') return;
    try {
      this.timerAudio ??= new AudioContext();
      void this.timerAudio.resume().catch(() => undefined);
    } catch { /* The timer remains available without sound. */ }
  }

  private playTimerSound(): void {
    const audio = this.timerAudio;
    if (!audio || audio.state !== 'running' || this.timerSound() === 'off' || !this.timerVolume()) return;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    const now = audio.currentTime;
    tone.frequency.value = this.timerSound() === 'soft' ? 440 : 784;
    volume.gain.setValueAtTime(this.timerVolume() * .18, now);
    volume.gain.exponentialRampToValueAtTime(.001, now + .45);
    tone.connect(volume).connect(audio.destination);
    tone.start(now);
    tone.stop(now + .45);
  }

  sendMessage(text: string): void {
    if (!text.trim() || this.sendingMessage() || this.groupChatPaused() || !this.canUseCapability('chat')) return;
    const user = this.auth.currentUser();
    if (!user) return;
    const roomId = this.roomId();
    const transition = this.roomTransition;
    const submittedDraft = this.chatDraft();
    const pendingId = `pending-${crypto.randomUUID()}`;
    const now = new Date();
    const pending: RoomChatMessage = {
      id: pendingId,
      senderId: user.id,
      sender: user.full_name,
      text: text.trim(),
      time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      initials: user.full_name.split(' ').filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase() || 'U',
      color: '#714cb6',
      isMe: true,
    };
    this.sendingMessage.set(true);
    this.messages.update(messages => [...messages, pending]);
    this.studyRoomService.sendMessage(roomId, user.id, user.full_name, text.trim()).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: message => {
        if (!this.isCurrentRoomTransition(roomId, transition)) return;
        this.sendingMessage.set(false);
        if (this.chatDraft() === submittedDraft) this.chatDraft.set('');
        const mapped = this.mapMessage(message, user.id);
        this.messages.update(messages => [...messages.filter(item => item.id !== pendingId && item.id !== mapped.id), mapped]);
        void this.media.sendRealtime({ type: 'chat', payload: mapped });
      },
      error: () => {
        if (!this.isCurrentRoomTransition(roomId, transition)) return;
        this.sendingMessage.set(false);
        this.messages.update(messages => messages.filter(item => item.id !== pendingId));
        this.showNotice('Không thể gửi tin nhắn. Vui lòng thử lại.');
      },
    });
  }
  changeZoom(delta: number): void { this.zoom.set(Math.max(30, Math.min(300, this.zoom() + delta))); }
  resetViewport(): void { this.zoom.set(100); this.pan.set({ x: 0, y: 0 }); }
  async toggleMic(): Promise<void> {
    if (!this.canUseCapability('voice')) { this.showNotice('Voice đang bị tắt cho thành viên.'); return; }
    await this.media.toggleMic();
    this.broadcastMediaState();
  }
  async toggleCamera(): Promise<void> {
    if (!this.canUseCapability('camera')) { this.showNotice('Camera đang bị tắt cho thành viên.'); return; }
    await this.media.toggleCamera(); if (this.localVideo?.nativeElement) this.localVideo.nativeElement.srcObject = this.media.localVideo;
    this.broadcastMediaState();
  }
  async toggleScreen(): Promise<void> {
    if (!this.canUseCapability('shareScreen')) { this.showNotice('Bạn chưa được cấp quyền chia sẻ màn hình.'); return; }
    const wasSharing = this.sharingScreen();
    await this.media.toggleScreen();
    if (!wasSharing && this.sharingScreen()) {
      const scale = this.zoom() / 100;
      const size = this.screenSize();
      const viewport = this.viewportSize();
      this.screenPosition.set({ x: (viewport.width / 2 - this.pan().x) / scale - size.width / 2, y: (viewport.height / 2 - this.pan().y) / scale - size.height / 2 });
    }
    if (this.screenVideo?.nativeElement) this.screenVideo.nativeElement.srcObject = this.media.sharedScreen;
    this.broadcastScreenState(this.sharingScreen());
  }
  remoteCameraStream(userId: string): MediaStream | null { return this.media.cameraStream(userId); }
  remoteMicOn(userId: string): boolean { return this.remoteMediaStates()[userId]?.micOn ?? false; }
  remoteCamOn(userId: string): boolean { return this.remoteMediaStates()[userId]?.camOn ?? !!this.remoteCameraStream(userId); }
  isSpeaking(userId: string): boolean { return this.media.activeSpeakerIds().has(userId); }
  isLocalSpeaking(): boolean { const userId = this.auth.currentUser()?.id; return this.micOn() && !!userId && this.isSpeaking(userId); }
  remoteScreenOwner(screen: RemoteScreenStream): RoomParticipant | undefined { return this.participants().find(person => person.userId === screen.participantId); }
  participantColor(participant: RoomParticipant): string {
    const palette = ['#714cb6', '#3559b8', '#2daa6e', '#e05297', '#b45309', '#2f7f9d', '#8b5cf6'];
    const seed = participant.userId || participant.name;
    const index = [...seed].reduce((total, character) => total + character.charCodeAt(0), 0) % palette.length;
    return palette[index];
  }
  avatarFailed(userId: string): boolean { return this.failedAvatarIds().has(userId); }
  markAvatarFailed(userId: string): void {
    this.failedAvatarIds.update(ids => new Set(ids).add(userId));
  }
  readonly selectedParticipant = computed(() =>
    this.participants().find(person => person.userId === this.selectedParticipantId()),
  );
  private participantAnchor?: HTMLElement;
  private panelTrigger?: HTMLElement;
  @ViewChild('roomShell') private roomShell?: ElementRef<HTMLElement>;
  @ViewChild('roomHeader') private roomHeader?: ElementRef<HTMLElement>;
  @ViewChild('pomodoroWidget') private pomodoroWidget?: ElementRef<HTMLElement>;
  @ViewChild('roomDock') private roomDock?: ElementRef<HTMLElement>;
  @ViewChild('roomNotices') private roomNotices?: ElementRef<HTMLElement>;
  @ViewChild('memberPopover', { read: ElementRef }) private memberPopover?: ElementRef<HTMLElement>;
  @ViewChild('leaveDialog') private leaveDialog?: ElementRef<HTMLDialogElement>;

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.positionOverlays());
      for (const element of [this.roomShell, this.roomHeader, this.roomDock, this.roomNotices]) {
        if (element) observer.observe(element.nativeElement);
      }
      this.destroyRef.onDestroy(() => observer.disconnect());
      this.positionOverlays();
    });
    afterRenderEffect(() => {
      const open = this.leaveOpen();
      const dialog = this.leaveDialog?.nativeElement;
      if (open && dialog && !dialog.open) dialog.showModal();
      if (!open && dialog?.open) dialog.close();
    });
    afterRenderEffect(() => {
      const panel = this.addOpen() ? 'app-add-to-canvas-menu'
        : this.emojiOpen() ? 'app-reaction-picker'
        : this.lofiOpen() ? 'app-lofi-player'
        : this.controlOpen() ? 'app-room-control-panel'
        : '';
      if (panel) this.roomShell?.nativeElement.querySelector<HTMLElement>(`${panel} button`)?.focus({ preventScroll: true });
    });
    afterRenderEffect(() => {
      this.pan();
      this.zoom();
      this.viewportSize();
      this.selectedParticipant();
      this.positionOverlays();
    });
  }

  startRemoteAvatarDrag(event: PointerEvent, person: RoomParticipant): void {
    this.suppressAvatarClick = undefined;
    if (event.button !== 0 || this.currentRole() === 'member' || this.remoteAvatarGesture || this.canvasGesture) return;
    this.remoteAvatarGesture = {
      userId: person.userId, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, origin: person.position, moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  private moveRemoteAvatar(event: PointerEvent): boolean {
    const gesture = this.remoteAvatarGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return true;
    gesture.moved = true;
    const scale = this.zoom() / 100;
    this.applyParticipantPosition(gesture.userId, { x: gesture.origin.x + dx / scale, y: gesture.origin.y + dy / scale });
    return true;
  }

  private applyParticipantPosition(userId: string, position: { x: number; y: number }): void {
    this.liveParticipantPositions.set(userId, position);
    if (this.auth.currentUser()?.id === userId) this.memberPosition.set(position);
    this.participants.update(people => people.map(person => person.userId === userId ? { ...person, position } : person));
  }

  toggleParticipantPopover(event: MouseEvent, userId: string): void {
    if (event.detail !== 0 && this.suppressAvatarClick === userId) {
      this.suppressAvatarClick = undefined;
      return;
    }
    if (this.selectedParticipantId() === userId) {
      this.closeParticipantPopover();
      return;
    }
    this.closeRoomPanels();
    this.participantAnchor = event.currentTarget as HTMLElement;
    this.selectedParticipantId.set(userId);
    requestAnimationFrame(() => {
      if (this.selectedParticipantId() !== userId) return;
      this.positionOverlays();
      this.memberPopover?.nativeElement.querySelector('button')?.focus();
    });
  }

  @HostListener('document:pointerdown', ['$event'])
  closeMemberOnOutsidePointer(event: PointerEvent): void {
    if (!this.selectedParticipantId()) return;
    const target = event.target as Node;
    if (!this.participantAnchor?.contains(target) && !this.memberPopover?.nativeElement.contains(target)) {
      this.closeParticipantPopover(false);
    }
  }

  closeParticipantPopover(restoreFocus = true): void {
    if (restoreFocus) this.participantAnchor?.focus();
    this.selectedParticipantId.set(null);
    this.participantAnchor = undefined;
  }

  private positionOverlays(): void {
    const shell = this.roomShell?.nativeElement;
    const header = this.roomHeader?.nativeElement;
    const dock = this.roomDock?.nativeElement;
    if (!shell || !header || !dock) return;
    const headerEdge = header.getBoundingClientRect().bottom;
    const dockTop = dock.getBoundingClientRect().top;
    const noticesEdge = this.roomNotices?.nativeElement.getBoundingClientRect().bottom ?? 0;
    this.positionTimerScopeMenu();
    shell.style.setProperty('--room-header-edge', `${headerEdge + 8}px`);
    shell.style.setProperty('--room-notices-edge', `${Math.max(headerEdge, noticesEdge) + 8}px`);
    shell.style.setProperty('--room-dock-edge', `${shell.clientHeight - dockTop + 8}px`);
    this.pomodoroWidget?.nativeElement.style.setProperty(
      '--pomodoro-max-height',
      `${Math.max(1, (dockTop - 20) / (this.zoom() / 100))}px`,
    );
    for (const button of dock.querySelectorAll<HTMLElement>('[data-tool]')) {
      const rect = button.getBoundingClientRect();
      shell.style.setProperty(`--${button.dataset['tool']}-anchor`, `${rect.left + rect.width / 2}px`);
    }
    const popover = this.memberPopover?.nativeElement;
    const anchor = this.participantAnchor?.getBoundingClientRect();
    if (!popover || !anchor) return;
    const gap = 8;
    const margin = 12;
    const topEdge = Math.max(headerEdge, noticesEdge) + gap;
    const above = Math.max(0, Math.min(dockTop, anchor.top) - gap - topEdge);
    const below = Math.max(0, dockTop - Math.max(topEdge, anchor.bottom) - gap);
    const openAbove = below < popover.scrollHeight && above > below;
    const height = openAbove ? above : below;
    const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - popover.offsetWidth / 2, shell.clientWidth - popover.offsetWidth - margin));
    const top = openAbove ? Math.min(dockTop, anchor.top) - gap - Math.min(popover.scrollHeight, height) : Math.max(topEdge, anchor.bottom + gap);
    popover.style.visibility = height >= 48 ? 'visible' : 'hidden';
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.maxHeight = `${height}px`;
  }

  private closeRoomPanels(): void {
    this.panelTrigger = undefined;
    for (const panel of [this.addOpen, this.emojiOpen, this.lofiOpen, this.chatOpen, this.controlOpen]) panel.set(false);
    this.closeParticipantPopover(false);
  }

  closePanel(panel: WritableSignal<boolean>): void {
    if (!panel()) return;
    panel.set(false);
    this.panelTrigger?.focus();
    this.panelTrigger = undefined;
  }

  openPanel(panel: WritableSignal<boolean>, event: MouseEvent, requestsOnly = false): void {
    if (panel()) {
      this.closePanel(panel);
      return;
    }
    this.closeRoomPanels();
    this.panelTrigger = event.currentTarget as HTMLElement;
    if (panel === this.controlOpen) this.requestsOnly.set(requestsOnly);
    panel.set(true);
  }

  toggleTool(tool: 'add' | 'reaction' | 'lofi', event: MouseEvent): void {
    this.openPanel({ add: this.addOpen, reaction: this.emojiOpen, lofi: this.lofiOpen }[tool], event);
  }

  @HostListener('document:keydown.escape')
  closeOverlayOnEscape(): void {
    if (this.leaveOpen() || this.imageOpen() || this.controlOpen() || this.inviteOpen()) return;
    if (this.selectedParticipantId()) {
      this.closeParticipantPopover();
      return;
    }
    const panel = [this.addOpen, this.emojiOpen, this.lofiOpen, this.chatOpen, this.controlOpen].find(open => open());
    if (panel) this.closePanel(panel);
  }

  openLeave(event: MouseEvent): void {
    this.closeRoomPanels();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    this.departureChoice.set('');
    this.successorId.set('');
    this.departureError.set('');
    this.leaveOpen.set(true);
  }

  closeSuccessorPickerOnBlur(event: FocusEvent, picker: HTMLDetailsElement): void {
    if (!(event.relatedTarget instanceof Node) || !picker.contains(event.relatedTarget)) picker.open = false;
  }

  cancelLeave(dialog?: HTMLDialogElement): void {
    const picker = dialog?.querySelector<HTMLDetailsElement>('details[open]');
    if (picker) {
      picker.open = false;
      picker.querySelector('summary')?.focus();
      return;
    }
    if (!this.leaving()) this.leaveOpen.set(false);
  }

  remoteScreenLayout(screen: RemoteScreenStream, index: number): ScreenLayout {
    return this.remoteScreenLayouts()[screen.participantId] || { active: true, x: 400 + index * 36, y: 205 + index * 36, width: 640, height: 360 };
  }
  async setCustomBackground(file: File): Promise<void> {
    const request = ++this.backgroundRequest;
    this.backgroundError.set('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.backgroundError.set('Chọn ảnh JPEG, PNG, WebP hoặc AVIF tối đa 10 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (request !== this.backgroundRequest) return;
      const previous = this.customBackground();
      this.customBackground.set(url);
      if (previous) URL.revokeObjectURL(previous);
    } catch {
      if (request === this.backgroundRequest) this.backgroundError.set('Không đọc được ảnh nền.');
    } finally {
      if (this.customBackground() !== url) URL.revokeObjectURL(url);
    }
  }

  private clearCustomBackground(): void {
    this.backgroundRequest++;
    const url = this.customBackground();
    this.customBackground.set('');
    if (url) URL.revokeObjectURL(url);
  }

  selectTheme(themeId: string): void {
    const roomId = this.roomId();
    this.studyRoomService.changeTheme(roomId, themeId).subscribe({
      next: () => {
        if (roomId !== this.roomId()) return;
        this.clearCustomBackground();
        this.backgroundError.set('');
        this.selectedTheme.set(themeId);
        sessionStorage.setItem('study_room_theme', themeId);
        void this.media.sendRealtime({ type: 'theme', payload: { themeId } });
      },
      error: () => { if (roomId === this.roomId()) this.showNotice('Bạn không có quyền đổi giao diện phòng.'); },
    });
  }
  addCanvasItem(kind: NewCanvasItemKind): void {
    const media = kind === 'image' || kind === 'youtube';
    if (!this.canUseCapability(media ? 'upload' : 'whiteboard')) {
      this.showNotice(media ? 'Bạn chưa được cấp quyền thêm nội dung đa phương tiện.' : 'Bảng vẽ và ghi chú đang bị khóa.');
      return;
    }
    if (kind === 'image') {
      if (!this.media.connected()) {
        this.showNotice('Cần kết nối phòng để thêm ảnh.');
        return;
      }
      this.closePanel(this.addOpen);
      this.imageOpen.set(true);
      return;
    }
    this.insertCanvasItem(kind);
  }

  addCanvasText(request: { kind: 'text' | 'note' | 'checklist' | 'link'; content: string }): void {
    if (!this.canUseCapability('whiteboard')) {
      this.showNotice('Bạn chưa được cấp quyền thêm nội dung trên canvas.');
      return;
    }
    this.insertCanvasItem(request.kind, undefined, request.content);
  }

  addCanvasImage(image: CanvasImageSource): void {
    if (!this.canUseCapability('upload')) {
      this.showNotice('Bạn chưa được cấp quyền thêm nội dung đa phương tiện.');
    } else if (!this.media.connected()) {
      this.showNotice('Đã mất kết nối phòng. Vui lòng kết nối lại trước khi thêm ảnh.');
    } else {
      this.insertCanvasItem('image', image);
    }
    this.imageOpen.set(false);
  }

  private insertCanvasItem(kind: NewCanvasItemKind | 'text', image?: CanvasImageSource, content = ''): void {
    const sizes: Record<Exclude<CanvasItemKind, 'gif'>, [number, number]> = {
      text: [240, 80], note: [200, 180], image: [280, 180], youtube: [480, 300], whiteboard: [360, 240],
      checklist: [240, 180], link: [240, 100],
    };
    const imageScale = image ? Math.min(400 / image.width, 300 / image.height, 1) : 1;
    const [width, height] = image
      ? [Math.max(100, Math.round(image.width * imageScale)), Math.max(80, Math.round(image.height * imageScale))]
      : sizes[kind];
    const colors = ['#fff4a8', '#ffd6e8', '#d2f5df', '#d8eaff', '#e8dcff'];
    const scale = this.zoom() / 100;
    const viewport = this.viewportSize();
    const item: CanvasItem = {
      id: crypto.randomUUID(),
      kind,
      content,
      x: Math.round((viewport.width / 2 - this.pan().x) / scale - width / 2),
      y: Math.round((viewport.height / 2 - this.pan().y) / scale - height / 2),
      width, height,
      z: this.nextCanvasZ(),
      ownerId: this.auth.currentUser()?.id,
      color: kind === 'text' ? '#f8fafc' : kind === 'note' ? colors[0] : kind === 'checklist' || kind === 'link' ? '#f8fafc' : undefined,
      url: image?.url,
      label: image ? 'Ảnh trên canvas' : undefined,
      strokes: kind === 'whiteboard' ? [] : undefined,
    };
    this.canvasItems.update(items => [...items, item]);
    this.selectedItemId.set(item.id);
    void this.media.sendRealtime({ type: 'canvas-upsert', payload: item });
  }
  updateCanvasItem(id: string, change: Partial<CanvasItem>): void {
    this.canvasItems.update(items => items.map(item => item.id === id ? { ...item, ...change } : item));
    const updated = this.canvasItems().find(item => item.id === id);
    if (updated) void this.media.sendRealtime({ type: 'canvas-upsert', payload: updated }, false);
  }
  commitCanvasItem(id: string, change: Partial<CanvasItem>): void {
    this.canvasItems.update(items => items.map(item => item.id === id ? { ...item, ...change } : item));
    const updated = this.canvasItems().find(item => item.id === id);
    if (updated) void this.media.sendRealtime({ type: 'canvas-upsert', payload: updated });
  }
  removeCanvasItem(id: string): void {
    this.canvasItems.update(items => items.filter(item => item.id !== id));
    if (this.selectedItemId() === id) this.selectedItemId.set(null);
    void this.media.sendRealtime({ type: 'canvas-remove', payload: { id } });
  }
  canManageItem(item: CanvasItem): boolean {
    const ownsItem = this.currentRole() !== 'member' || !item.ownerId || item.ownerId === this.auth.currentUser()?.id;
    if (!ownsItem) return false;
    if (item.kind === 'whiteboard' || item.kind === 'note' || item.kind === 'text' || item.kind === 'checklist' || item.kind === 'link') return this.canUseCapability('whiteboard');
    return true;
  }
  canUseCapability(capability: 'chat' | 'voice' | 'camera' | 'shareScreen' | 'upload' | 'whiteboard'): boolean {
    if (this.currentRole() === 'owner' || this.currentRole() === 'moderator') return true;
    const permissions = this.roomPermissions();
    if (capability === 'chat') return permissions.chatEnabled;
    if (capability === 'voice') return permissions.voiceEnabled;
    if (capability === 'camera') return permissions.cameraEnabled;
    if (capability === 'shareScreen') return permissions.participantShareScreen;
    if (capability === 'upload') return permissions.participantUpload;
    return !permissions.whiteboardLocked;
  }
  bringCanvasItemToFront(id: string): void {
    const item = this.canvasItems().find(current => current.id === id);
    if (!item) return;
    this.selectedItemId.set(id);
    if (!this.canManageItem(item)) return;
    this.commitCanvasItem(id, { z: this.nextCanvasZ() });
  }
  private nextCanvasZ(): number { return Math.max(10, this.memberZ(), ...this.canvasItems().map(item => item.z || 1)) + 1; }
  openChat(event: MouseEvent): void {
    if (this.groupChatPaused()) { this.showNotice('Chat đang tạm dừng theo cài đặt Pomodoro chung của chủ phòng.'); return; }
    if (!this.canUseCapability('chat')) { this.showNotice('Chat đang bị khóa cho thành viên.'); return; }
    this.openPanel(this.chatOpen, event);
    if (this.chatOpen()) this.unreadChatCount.set(0);
  }
  clearCanvasSelection(): void {
    this.selectedItemId.set(null);
    this.closeParticipantPopover(false);
  }

  updateRoomPermissions(permissions: RoomPermissions): void {
    this.roomPermissions.set(permissions);
    if (!this.canUseCapability('chat')) this.chatOpen.set(false);
    void this.media.sendRealtime({ type: 'permissions', payload: permissions });
  }
  applyLoadedPermissions(permissions: RoomPermissions): void {
    this.roomPermissions.set(permissions);
    if (!this.canUseCapability('chat')) this.chatOpen.set(false);
  }
  startCanvasPan(event: PointerEvent): void {
    if (!this.isCanvasBackground(event) || !event.isPrimary) return;
    this.beginCanvasGesture(event, 'pan');
  }

  scrollCanvas(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey || !this.isCanvasBackground(event)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewportSize().height : 1;
    const horizontal = event.shiftKey && !event.deltaX;
    this.pan.update(({ x, y }) => ({
      x: x - (horizontal ? event.deltaY : event.deltaX) * unit,
      y: y - (horizontal ? 0 : event.deltaY) * unit,
    }));
  }

  private isCanvasBackground(event: Event): boolean {
    const target = event.target;
    return target === event.currentTarget
      || (target instanceof Element && target.matches('.canvas-grid, .room-video'));
  }

  beginCanvasGesture(event: PointerEvent, kind: 'pan' | 'member' | 'timer' | 'screen' | 'screen-resize'): void {
    if (event.button !== 0 || !event.isPrimary || this.canvasGesture || this.remoteAvatarGesture) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, label, a, app-canvas-item') && kind !== 'screen-resize') return;
    event.preventDefault();
    if (kind === 'screen-resize') event.stopPropagation();
    if (kind === 'member') this.memberZ.set(this.nextCanvasZ());
    const origin = kind === 'pan' ? this.pan() : kind === 'member' ? this.memberPosition() : kind === 'timer' ? this.timerPosition() : kind === 'screen' ? this.screenPosition() : { x: this.screenSize().width, y: this.screenSize().height };
    this.canvasGesture = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: origin.x, originY: origin.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  moveCanvasGesture(event: PointerEvent): void {
    const gesture = this.canvasGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const scale = gesture.kind === 'pan' ? 1 : this.zoom() / 100;
    const next = { x: gesture.originX + (event.clientX - gesture.startX) / scale, y: gesture.originY + (event.clientY - gesture.startY) / scale };
    if (gesture.kind === 'pan') {
      this.pan.set(next);
      return;
    }
    if (gesture.kind === 'member') {
      const userId = this.auth.currentUser()?.id;
      if (userId) this.applyParticipantPosition(userId, next);
      else this.memberPosition.set(next);
      const now = performance.now();
      if (now - this.lastPositionSentAt >= 50) {
        this.lastPositionSentAt = now;
        this.broadcastParticipantPosition(next);
      }
    }
    else if (gesture.kind === 'timer') this.timerPosition.set(next);
    else if (gesture.kind === 'screen') this.screenPosition.set(next);
    else this.screenSize.set({ width: Math.max(320, next.x), height: Math.max(180, next.y) });
    if (gesture.kind === 'screen' || gesture.kind === 'screen-resize') {
      const now = performance.now();
      if (now - this.lastScreenStateSentAt >= 50) {
        this.lastScreenStateSentAt = now;
        this.broadcastScreenState(true);
      }
    }
  }
  handleCanvasPointerMove(event: PointerEvent): void {
    if (this.moveRemoteAvatar(event)) return;
    this.moveCanvasGesture(event);
    if (this.canvasGesture) return;
    const now = performance.now();
    if (now - this.lastCursorSentAt < 60) return;
    this.lastCursorSentAt = now;
    const user = this.auth.currentUser();
    if (!user) return;
    const scale = this.zoom() / 100;
    void this.media.sendRealtime({
      type: 'cursor',
      payload: {
        userId: user.id,
        name: user.full_name,
        x: (event.clientX - this.pan().x) / scale,
        y: (event.clientY - this.pan().y) / scale,
        color: '#714cb6',
      },
    }, false);
  }
  endCanvasGesture(event: PointerEvent): void {
    const remote = this.remoteAvatarGesture;
    if (remote?.pointerId === event.pointerId) {
      this.remoteAvatarGesture = undefined;
      const position = this.liveParticipantPositions.get(remote.userId);
      if (remote.moved && position) {
        this.suppressAvatarClick = remote.userId;
        void this.media.sendRealtime({ type: 'participant-position', payload: { userId: remote.userId, position } });
      }
      return;
    }
    const gesture = this.canvasGesture;
    if (gesture?.pointerId !== event.pointerId) return;
    this.canvasGesture = null;
    if (gesture.kind === 'screen' || gesture.kind === 'screen-resize') { this.broadcastScreenState(true); return; }
    if (gesture.kind !== 'member') return;
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    const { x, y } = this.memberPosition();
    const position = { x: Math.round(x), y: Math.round(y) };
    this.applyParticipantPosition(userId, position);
    this.broadcastParticipantPosition(position);
    this.persistOwnPosition(userId, position);
  }

  private persistOwnPosition(userId: string, position: { x: number; y: number }): void {
    const roomId = this.roomId();
    const transition = this.roomTransition;
    this.positionSave = this.positionSave.then(async () => {
      if (this.destroyRef.destroyed || !this.isCurrentRoomTransition(roomId, transition)) return;
      try {
        await firstValueFrom(this.studyRoomService.updatePosition(roomId, userId, position));
      } catch {
        if (!this.destroyRef.destroyed && this.isCurrentRoomTransition(roomId, transition)) {
          this.showNotice('Không thể lưu vị trí trên canvas.');
        }
      }
    });
  }

  moveMiniMapWithKeyboard(event: KeyboardEvent): void {
    const step = 40;
    const directions: Record<string, { x: number; y: number } | undefined> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    this.pan.update(({ x, y }) => ({ x: x + direction.x, y: y + direction.y }));
  }
  miniMapPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.miniMapDragging = true;
    const map = event.currentTarget as HTMLElement;
    map.focus();
    map.setPointerCapture(event.pointerId);
    this.panFromMiniMap(event);
  }
  miniMapPointerMove(event: PointerEvent): void {
    if (!this.miniMapDragging) return;
    event.stopPropagation();
    this.panFromMiniMap(event);
  }
  miniMapPointerUp(event: PointerEvent): void {
    if (!this.miniMapDragging) return;
    event.stopPropagation();
    this.miniMapDragging = false;
  }
  showReaction(emoji: string): void {
    const userId = this.auth.currentUser()?.id || '';
    const position = this.memberPosition();
    const scale = this.zoom() / 100;
    this.displayReaction(emoji, (position.x + 48) * scale + this.pan().x, position.y * scale + this.pan().y);
    void this.media.sendRealtime({ type: 'reaction', payload: { emoji, userId, x: position.x + 48, y: position.y } }, false);
  }
  removeParticipant(participant: RoomParticipant): void {
    if (this.currentRole() === 'member') {
      this.showNotice('Bạn không có quyền xóa thành viên khỏi phòng.');
      return;
    }
    const currentUserId = this.auth.currentUser()?.id;
    if (!participant.userId || participant.userId === currentUserId) return;
    this.disconnectedParticipantIds.add(participant.userId);
    this.removeParticipantState(participant.userId);
    void this.media.sendRealtime({ type: 'participant-kick', payload: { userId: participant.userId } });
    this.showNotice(`Đã xóa ${participant.displayName || participant.name} khỏi phiên hiện tại.`);
  }
  private displayReaction(emoji: string, x: number, y: number): void {
    const id = crypto.randomUUID();
    this.reactions.update(reactions => [...reactions, { id, emoji, x, y }]);
    window.setTimeout(() => this.reactions.update(reactions => reactions.filter(reaction => reaction.id !== id)), 2200);
  }
  private broadcastTimer(): void {
    void this.media.sendRealtime({ type: 'timer', payload: this.groupTimerPayload() });
  }
  private broadcastMediaState(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    void this.media.sendRealtime({ type: 'media-state', payload: { userId, micOn: this.micOn(), camOn: this.camOn() } }, false);
  }
  private groupTimerPayload() {
    const timer = this.timers().group;
    return { ...timer, timeLeft: timerRemaining(timer, Date.now()), isRunning: timer.endsAt !== null };
  }
  private broadcastParticipantPosition(position: { x: number; y: number }): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    void this.media.sendRealtime({ type: 'participant-position', payload: { userId, position } });
  }
  private broadcastScreenState(active: boolean): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    void this.media.sendRealtime({ type: 'screen-state', payload: { userId, active, ...this.screenPosition(), ...this.screenSize() } }, false);
  }
  private applyRealtimeEvent(event: RoomRealtimeEnvelope, senderId: string): void {
    if (event.type === 'participant-kick') {
      const payload = event.payload as { userId?: string };
      const sender = this.participants().find(person => person.userId === senderId);
      if (payload.userId === this.auth.currentUser()?.id && (sender?.role === 'owner' || sender?.role === 'moderator')) this.leaveRoom();
      return;
    }
    if (event.type === 'sync-request') {
      this.broadcastParticipantPosition(this.memberPosition());
      this.broadcastMediaState();
      if (this.sharingScreen()) this.broadcastScreenState(true);
      const ownerPresent = this.participants().some(person => person.role === 'owner' && !person.isSelf);
      if (this.currentRole() === 'member' || (this.currentRole() === 'moderator' && ownerPresent)) return;
      void this.media.sendRealtime({ type: 'canvas-snapshot', payload: { items: this.canvasItems(), timer: this.groupTimerPayload() } });
      return;
    }
    if (event.type === 'canvas-upsert') {
      if (!this.isCanvasItem(event.payload)) return;
      const item = event.payload;
      if (!this.canPeerManageCanvasItem(senderId, item)) return;
      this.canvasItems.update(items => [...items.filter(current => current.id !== item.id), item]);
      return;
    }
    if (event.type === 'canvas-remove') {
      const payload = event.payload as { id?: string };
      const item = payload.id ? this.canvasItems().find(current => current.id === payload.id) : undefined;
      if (item && this.canPeerManageCanvasItem(senderId, item)) this.canvasItems.update(items => items.filter(current => current.id !== payload.id));
      return;
    }

    if (event.type === 'reaction') {
      const payload = event.payload as { emoji?: string; userId?: string; x?: number; y?: number };
      if (payload.emoji && payload.userId === senderId) {
        const participant = payload.userId ? this.participants().find(person => person.userId === payload.userId) : undefined;
        const worldX = typeof payload.x === 'number' ? payload.x : (participant?.position.x ?? 300) + 48;
        const worldY = typeof payload.y === 'number' ? payload.y : participant?.position.y ?? 250;
        const scale = this.zoom() / 100;
        this.displayReaction(payload.emoji, worldX * scale + this.pan().x, worldY * scale + this.pan().y);
      }
      return;
    }
    if (event.type === 'theme') {
      const payload = event.payload as { themeId?: string };
      const senderRole = this.participants().find(person => person.userId === senderId)?.role;
      if ((senderRole === 'owner' || senderRole === 'moderator') && payload.themeId && this.themes.some(theme => theme.id === payload.themeId)) {
        this.selectedTheme.set(payload.themeId);
        this.studyRoomService.cacheTheme(this.roomId(), payload.themeId);
        sessionStorage.setItem('study_room_theme', payload.themeId);
      }
      return;
    }
    if (event.type === 'permissions') {
      const permissions = event.payload as RoomPermissions;
      const senderRole = this.participants().find(person => person.userId === senderId)?.role;
      if (senderRole === 'owner' && typeof permissions?.chatEnabled === 'boolean') this.applyLoadedPermissions(permissions);
      return;
    }
    if (event.type === 'chat') {
      const message = event.payload as RoomChatMessage;
      if (message?.id && message.text && message.senderId === senderId) {
        const received = { ...message, isMe: message.senderId === this.auth.currentUser()?.id };
        const isNew = !this.messages().some(item => item.id === message.id);
        this.messages.update(messages => [...messages.filter(item => item.id !== message.id), received]);
        if (isNew && !received.isMe && !(this.chatOpen() && !this.groupChatPaused() && this.canUseCapability('chat'))) {
          this.unreadChatCount.update(count => count + 1);
        }
      }
      return;
    }
    if (event.type === 'cursor') {
      const cursor = event.payload as { userId?: string; name?: string; x?: number; y?: number; color?: string };
      if (!cursor.userId || cursor.userId !== senderId || typeof cursor.x !== 'number' || typeof cursor.y !== 'number') return;
      this.remoteCursors.update(cursors => ({ ...cursors, [cursor.userId as string]: {
        x: cursor.x as number, y: cursor.y as number, name: cursor.name || 'Thành viên', color: cursor.color || '#64748b',
      } }));
      return;
    }
    if (event.type === 'media-state') {
      const state = event.payload as { userId?: string };
      if (state.userId === senderId) this.applyRemoteMediaState(event.payload);
      return;
    }
    if (event.type === 'participant-position') {
      const payload = event.payload as { userId?: string; position?: { x: number; y: number } } | null;
      if (!payload?.userId || !payload.position || !Number.isFinite(payload.position.x) || !Number.isFinite(payload.position.y)) return;
      const senderRole = this.peerRole(senderId);
      if (payload.userId !== senderId && senderRole !== 'owner' && senderRole !== 'moderator') return;
      const localId = this.auth.currentUser()?.id;
      if (payload.userId !== senderId && payload.userId !== localId &&
        !this.participants().some(person => person.userId === payload.userId)) return;
      this.applyParticipantPosition(payload.userId, payload.position);
      if (payload.userId === localId && senderId !== localId) this.persistOwnPosition(localId, payload.position);
      return;
    }
    if (event.type === 'screen-state') {
      const layout = event.payload as { userId?: string; active?: boolean; x?: number; y?: number; width?: number; height?: number };
      if (!layout.userId || layout.userId !== senderId || typeof layout.active !== 'boolean' || typeof layout.x !== 'number' || typeof layout.y !== 'number' || typeof layout.width !== 'number' || typeof layout.height !== 'number') return;
      this.remoteScreenLayouts.update(layouts => ({ ...layouts, [layout.userId as string]: { active: layout.active as boolean, x: layout.x as number, y: layout.y as number, width: Math.max(320, layout.width as number), height: Math.max(180, layout.height as number) } }));
      return;
    }
    if (event.type === 'timer') {
      const role = this.peerRole(senderId);
      if (role === 'owner' || role === 'moderator') this.applyRemoteTimer(event.payload);
      return;
    }
    if (event.type === 'canvas-snapshot') {
      const payload = event.payload as { items?: CanvasItem[]; timer?: unknown; mediaState?: unknown };
      if (!this.isAuthoritativeSnapshotSender(senderId)) return;
      if (Array.isArray(payload.items)) this.canvasItems.set(payload.items.filter(item => this.isCanvasItem(item)));
      if (payload.timer) this.applyRemoteTimer(payload.timer);
      if (payload.mediaState) this.applyRemoteMediaState(payload.mediaState);
    }
  }
  private peerRole(senderId: string): RoomParticipant['role'] | undefined {
    return this.participants().find(person => person.userId === senderId)?.role;
  }
  private isCanvasItem(value: unknown): value is CanvasItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<CanvasItem>;
    const kinds: CanvasItemKind[] = ['text', 'note', 'image', 'gif', 'youtube', 'whiteboard', 'checklist', 'link'];
    return typeof item.id === 'string' && item.id.length > 0
      && !!item.kind && kinds.includes(item.kind)
      && typeof item.x === 'number' && Number.isFinite(item.x)
      && typeof item.y === 'number' && Number.isFinite(item.y)
      && typeof item.width === 'number' && Number.isFinite(item.width) && item.width > 0
      && typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0;
  }
  private canPeerManageCanvasItem(senderId: string, item: CanvasItem): boolean {
    const role = this.peerRole(senderId);
    if (role === 'owner' || role === 'moderator') return true;
    if (role !== 'member' || item.ownerId !== senderId) return false;
    const existing = this.canvasItems().find(current => current.id === item.id);
    if (existing && existing.ownerId !== senderId) return false;
    const mediaItem = item.kind === 'image' || item.kind === 'gif' || item.kind === 'youtube';
    if (existing && mediaItem) return true;
    return mediaItem ? this.roomPermissions().participantUpload : !this.roomPermissions().whiteboardLocked;
  }
  private isAuthoritativeSnapshotSender(senderId: string): boolean {
    const role = this.peerRole(senderId);
    if (role === 'owner') return true;
    return role === 'moderator' && this.currentRole() !== 'owner' && !this.participants().some(person => person.role === 'owner');
  }
  private applyRemoteMediaState(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const state = value as { userId?: string; micOn?: boolean; camOn?: boolean };
    if (!state.userId || typeof state.micOn !== 'boolean' || typeof state.camOn !== 'boolean') return;
    this.remoteMediaStates.update(states => ({ ...states, [state.userId as string]: { micOn: state.micOn as boolean, camOn: state.camOn as boolean } }));
  }
  private applyRemoteTimer(value: unknown): void {
    const now = Date.now();
    const timer = readRoomTimer(value, now);
    if (!timer) return;
    this.timerNow.set(now);
    this.timers.update(timers => ({ ...timers, group: timer }));
  }
  confirmOwnerDeparture(): void {
    if (!this.extras.demo || this.currentRole() !== 'owner' || this.leaving()) return;
    const choice = this.departureChoice();
    if (!choice) return;
    let decision: OwnerDeparture = { kind: 'close' };
    if (choice !== 'close') {
      const candidates = this.eligibleSuccessors();
      const successor = choice === 'auto'
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : candidates.find(member => member.userId === this.successorId());
      if (!successor) {
        this.departureError.set('Chọn một thành viên hiện đang trong phòng.');
        return;
      }
      decision = { kind: 'transfer', successorId: successor.userId };
    }
    this.departureError.set('');
    this.leaving.set(true);
    this.studyRoomService.leaveAsOwner(this.roomId(), decision).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { void this.completeLeave(); },
      error: () => {
        this.leaving.set(false);
        this.departureError.set('Không thực hiện được thao tác. Vui lòng thử lại.');
      },
    });
  }

  leaveRoom(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId || this.leaving()) return;
    this.leaving.set(true);
    this.studyRoomService.leaveRoom(this.roomId(), userId).subscribe({
      next: () => { void this.completeLeave(); },
      error: () => { void this.completeLeave(); },
    });
  }
  private async completeLeave(): Promise<void> {
    this.hasJoined = false;
    this.studyRoomService.clearJoinedRoom(this.roomId());
    await this.media.dispose();
    await this.router.navigate(['/learning/study-room']);
  }
  backToLobby(): void { void this.router.navigate(['/learning/study-room']); }
  openInvite(): void {
    this.inviteFeedback.set('');
    this.inviteOpen.set(true);
  }

  async copyLink(inDialog = false): Promise<void> {
    let message: string;
    try {
      await navigator.clipboard.writeText(this.inviteLink());
      message = 'Đã sao chép link phòng.';
    } catch {
      message = inDialog ? 'Không thể sao chép tự động. Bạn có thể chọn và sao chép link trong ô trên.'
        : 'Không thể sao chép link phòng trên trình duyệt này.';
    }
    if (inDialog) this.inviteFeedback.set(message);
    else this.showNotice(message);
  }

  private showNotice(message: string): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 2600);
  }
  private withoutRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
    const next = { ...record };
    delete next[key];
    return next;
  }
  private mergeMessages(incoming: RoomChatMessage[], current: RoomChatMessage[]): RoomChatMessage[] {
    const incomingIds = new Set(incoming.map(message => message.id));
    return [...incoming, ...current.filter(message => !incomingIds.has(message.id))];
  }
  private removeParticipantState(participantId: string): void {
    this.liveParticipantPositions.delete(participantId);
    this.participants.update(participants => participants.filter(person => person.userId !== participantId));
    this.remoteCursors.update(cursors => this.withoutRecordKey(cursors, participantId));
    this.remoteMediaStates.update(states => this.withoutRecordKey(states, participantId));
    this.remoteScreenLayouts.update(layouts => this.withoutRecordKey(layouts, participantId));
    if (this.selectedParticipantId() === participantId) this.closeParticipantPopover(false);
  }
  private buildMiniMapModel(): MiniMapModel {
    const miniWidth = 130;
    const miniHeight = 84;
    const zoom = this.zoom() / 100;
    const viewportSize = this.viewportSize();
    const viewport = { left: -this.pan().x / zoom, top: -this.pan().y / zoom, right: (-this.pan().x + viewportSize.width) / zoom, bottom: (-this.pan().y + viewportSize.height) / zoom };
    const source: Array<{ left: number; top: number; right: number; bottom: number; kind: MiniMapRect['kind'] }> = [
      ...this.canvasItems().map(item => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height, kind: 'item' as const })),
      ...this.participants().filter(person => !person.isSelf).map(person => ({ left: person.position.x, top: person.position.y, right: person.position.x + 96, bottom: person.position.y + 118, kind: 'member' as const })),
      { left: this.memberPosition().x, top: this.memberPosition().y, right: this.memberPosition().x + 96, bottom: this.memberPosition().y + 118, kind: 'member' },
      ...(this.timerOpen() ? [{ left: this.timerPosition().x, top: this.timerPosition().y, right: this.timerPosition().x + 300, bottom: this.timerPosition().y + 170, kind: 'timer' as const }] : []),
      { ...viewport, kind: 'viewport' },
    ];
    const padding = 180;
    const bounds = source.reduce((value, rect) => ({ left: Math.min(value.left, rect.left), top: Math.min(value.top, rect.top), right: Math.max(value.right, rect.right), bottom: Math.max(value.bottom, rect.bottom) }), { ...viewport });
    bounds.left -= padding; bounds.top -= padding; bounds.right += padding; bounds.bottom += padding;
    const scale = Math.min(miniWidth / Math.max(bounds.right - bounds.left, 1), miniHeight / Math.max(bounds.bottom - bounds.top, 1));
    const offsetX = (miniWidth - (bounds.right - bounds.left) * scale) / 2;
    const offsetY = (miniHeight - (bounds.bottom - bounds.top) * scale) / 2;
    return { bounds, scale, offsetX, offsetY, rects: source.map(rect => ({ x: offsetX + (rect.left - bounds.left) * scale, y: offsetY + (rect.top - bounds.top) * scale, width: Math.max((rect.right - rect.left) * scale, 4), height: Math.max((rect.bottom - rect.top) * scale, 4), kind: rect.kind })) };
  }
  private panFromMiniMap(event: PointerEvent): void {
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const model = this.miniMapModel();
    const miniX = Math.min(Math.max(event.clientX - rect.left - element.clientLeft, 0), element.clientWidth);
    const miniY = Math.min(Math.max(event.clientY - rect.top - element.clientTop, 0), element.clientHeight);
    const worldX = (miniX - model.offsetX) / model.scale + model.bounds.left;
    const worldY = (miniY - model.offsetY) / model.scale + model.bounds.top;
    const zoom = this.zoom() / 100;
    const viewport = this.viewportSize();
    this.pan.set({ x: viewport.width / 2 - worldX * zoom, y: viewport.height / 2 - worldY * zoom });
  }
}
