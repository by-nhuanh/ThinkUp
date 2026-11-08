import { Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomMessage, RoomParticipant, RoomPermissions, StudyRoomService } from '../services/study-room.service';
import { StudyRoomItem } from '../models/study-room.model';
import { LucideCopy, LucidePanelRight, LucidePlus, LucideMinus, LucideLocateFixed, LucideMic, LucideMicOff, LucideVideo, LucideVideoOff, LucideScreenShare, LucideMousePointer2, LucidePencil, LucideSmile, LucideMessageCircle, LucideSettings, LucideLogOut, LucideHeadphones, LucidePlay, LucidePause, LucideRotateCcw, LucideCrown, LucideBookOpen, LucideCoffee, LucideSkipForward, LucideShieldCheck, LucideUserRound, LucideAudioLines } from '@lucide/angular';
import { AddToCanvasMenuComponent, CanvasItemKind } from '../components/add-to-canvas-menu/add-to-canvas-menu.component';
import { CanvasItem, CanvasItemComponent } from '../components/canvas-item/canvas-item.component';
import { LofiPlayerComponent } from '../components/lofi-player/lofi-player.component';
import { RoomControlPanelComponent } from '../components/room-control-panel/room-control-panel.component';
import { PIXEL_DREAMLAND_MEDIA } from '../data/study-room-media';
import { ReactionPickerComponent } from '../components/reaction-picker/reaction-picker.component';
import { InkLayerComponent, InkStroke } from '../components/ink-layer/ink-layer.component';
import { RemoteScreenStream, RoomRealtimeEnvelope, StudyRoomMediaService } from '../services/study-room-media.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatPanelComponent, RoomChatMessage } from '../components/chat-panel/chat-panel.component';
import { ParticipantPopoverComponent } from '../components/participant-popover/participant-popover.component';

interface FloatingReaction { id: string; emoji: string; x: number; y: number; }
interface MiniMapRect { x: number; y: number; width: number; height: number; kind: 'item' | 'member' | 'timer' | 'viewport'; }
interface MiniMapModel { bounds: { left: number; top: number }; scale: number; offsetX: number; offsetY: number; rects: MiniMapRect[]; }
interface ScreenLayout { active: boolean; x: number; y: number; width: number; height: number; }

@Component({
  selector: 'app-study-room-view',
  standalone: true,
  providers: [StudyRoomMediaService],
  imports: [CommonModule, FormsModule, AddToCanvasMenuComponent, CanvasItemComponent, LofiPlayerComponent, RoomControlPanelComponent, ReactionPickerComponent, InkLayerComponent, ChatPanelComponent, ParticipantPopoverComponent, LucideCopy, LucidePanelRight, LucidePlus, LucideMinus, LucideLocateFixed, LucideMic, LucideMicOff, LucideVideo, LucideVideoOff, LucideScreenShare, LucideMousePointer2, LucidePencil, LucideSmile, LucideMessageCircle, LucideSettings, LucideLogOut, LucideHeadphones, LucidePlay, LucidePause, LucideRotateCcw, LucideCrown, LucideBookOpen, LucideCoffee, LucideSkipForward, LucideShieldCheck, LucideUserRound, LucideAudioLines],
  templateUrl: './study-room-view.component.html',
  styleUrl: './study-room-view.component.css'
})
export class StudyRoomViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly studyRoomService = inject(StudyRoomService);
  private readonly auth = inject(AuthService);
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
  readonly inviting = signal(false);
  readonly participants = signal<RoomParticipant[]>([]);
  readonly timerMode = signal<'focus' | 'break'>('focus');
  readonly timeLeft = signal<number>(25 * 60);
  readonly isRunning = signal<boolean>(false);
  readonly memberCount = computed(() => this.participants().length);
  readonly controlOpen = signal(false);
  readonly chatOpen = signal(false);
  readonly leaveOpen = signal(false);
  readonly micOn = this.media.micOn;
  readonly camOn = this.media.camOn;
  readonly penMode = signal(false);
  readonly penOptionsOpen = signal(false);
  readonly addOpen = signal(false);
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
  readonly inkStrokes = signal<InkStroke[]>([]);
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
  readonly focusLocked = computed(() => this.currentRole() === 'member' && this.timerMode() === 'focus' && this.isRunning());
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
  readonly activeTheme = computed(() => this.themes.find(item => item.id === this.selectedTheme()) || this.themes[0]);
  readonly isDarkTheme = computed(() => ['night', 'space', 'lofi-night', 'cozy-window', 'pragmata-horizon', 'genshin-impact', 'pixel-dreamland', 'pixel-skyline', 'pixel-quiet-night', 'anime-room', 'cozy-rainy-window'].includes(this.selectedTheme()));
  readonly background = computed(() => this.activeTheme().src && this.activeTheme().type !== 'video' ? `url('${this.activeTheme().src}') center / ${this.activeTheme().fit || 'cover'} no-repeat ${this.activeTheme().background || ''}` : this.activeTheme().background);
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
  private leaving = false;
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
  private readonly disconnectedParticipantIds = new Set<string>();

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
    this.timerPosition.set({ x: 50, y: Math.min(600, Math.max(280, this.viewportSize().height - 280)) });
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
      this.resetRoomState();
    }
    this.leaving = false;
    this.roomId.set(id);
    this.selectedTheme.set('white');
    this.openRoom(id, transition);
  }

  private resetRoomState(): void {
    this.stopTimer();
    this.sessionError.set('');
    this.notice.set('');
    this.timerMode.set('focus');
    this.timeLeft.set(25 * 60);
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(100);
    this.participants.set([]);
    this.messages.set([]);
    this.canvasItems.set([]);
    this.inkStrokes.set([]);
    this.remoteCursors.set({});
    this.remoteMediaStates.set({});
    this.remoteScreenLayouts.set({});
    this.selectedItemId.set(null);
    this.selectedParticipantId.set(null);
    this.chatOpen.set(false);
    this.controlOpen.set(false);
    this.addOpen.set(false);
    this.emojiOpen.set(false);
    this.leaveOpen.set(false);
    this.selectPointerTool();
    this.disconnectedParticipantIds.clear();
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
            await this.media.dispose();
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
          this.sessionError.set(this.media.error());
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
        this.participants.set(connectedMembers);
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
    this.stopTimer();
    if (this.roomPollInterval) clearInterval(this.roomPollInterval);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    void this.media.dispose();
    if (this.hasJoined && !this.leaving) {
      const userId = this.auth.currentUser()?.id;
      if (userId) this.studyRoomService.leaveRoom(this.roomId(), userId).subscribe({ error: () => { /* Component teardown must remain silent. */ } });
    }
  }

  toggleTimer(): void {
    if (this.isRunning()) {
      this.stopTimer();
    } else {
      this.startTimer();
    }
    this.broadcastTimer();
  }

  startTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.isRunning.set(true);
    this.timerInterval = setInterval(() => {
      const remaining = this.timeLeft() - 1;
      if (remaining <= 0) {
        const nextMode = this.timerMode() === 'focus' ? 'break' : 'focus';
        this.stopTimer();
        this.timerMode.set(nextMode);
        this.timeLeft.set(nextMode === 'focus' ? 25 * 60 : 5 * 60);
        this.broadcastTimer();
        this.showNotice(nextMode === 'break' ? 'Đã hoàn thành phiên tập trung. Đến giờ nghỉ!' : 'Giờ nghỉ đã kết thúc. Sẵn sàng tập trung!');
      } else {
        this.timeLeft.set(remaining);
      }
    }, 1000);
  }

  stopTimer(): void {
    this.isRunning.set(false);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetTimer(): void {
    this.stopTimer();
    this.timeLeft.set(this.timerMode() === 'focus' ? 25 * 60 : 5 * 60);
    this.broadcastTimer();
  }

  setTimerMode(mode: 'focus' | 'break'): void {
    this.stopTimer();
    this.timerMode.set(mode);
    this.timeLeft.set(mode === 'focus' ? 25 * 60 : 5 * 60);
    this.broadcastTimer();
  }

  stopFocusMode(): void {
    this.stopTimer();
    this.broadcastTimer();
    this.showNotice('Đã dừng chế độ tập trung.');
  }

  sendMessage(text: string): void {
    if (!text.trim() || this.focusLocked() || !this.canUseCapability('chat')) return;
    const user = this.auth.currentUser();
    if (!user) return;
    const roomId = this.roomId();
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
    this.messages.update(messages => [...messages, pending]);
    this.studyRoomService.sendMessage(roomId, user.id, user.full_name, text.trim()).subscribe({
      next: message => {
        if (roomId !== this.roomId()) return;
        const mapped = this.mapMessage(message, user.id);
        this.messages.update(messages => [...messages.filter(item => item.id !== pendingId && item.id !== mapped.id), mapped]);
        void this.media.sendRealtime({ type: 'chat', payload: mapped });
      },
      error: () => {
        if (roomId !== this.roomId()) return;
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
  isLocalSpeaking(): boolean { const userId = this.auth.currentUser()?.id; return !!userId && this.isSpeaking(userId); }
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
  toggleParticipantPopover(event: PointerEvent, userId: string): void {
    event.stopPropagation();
    this.selectedParticipantId.update(selected => selected === userId ? null : userId);
  }
  remoteScreenLayout(screen: RemoteScreenStream, index: number): ScreenLayout {
    return this.remoteScreenLayouts()[screen.participantId] || { active: true, x: 400 + index * 36, y: 205 + index * 36, width: 640, height: 360 };
  }
  selectTheme(themeId: string): void {
    const roomId = this.roomId();
    this.studyRoomService.changeTheme(roomId, themeId).subscribe({
      next: () => {
        if (roomId !== this.roomId()) return;
        this.selectedTheme.set(themeId);
        sessionStorage.setItem('study_room_theme', themeId);
        void this.media.sendRealtime({ type: 'theme', payload: { themeId } });
      },
      error: () => { if (roomId === this.roomId()) this.showNotice('Bạn không có quyền đổi giao diện phòng.'); },
    });
  }
  addCanvasItem(kind: CanvasItemKind): void {
    if ((kind === 'whiteboard' || kind === 'note' || kind === 'text') && !this.canUseCapability('whiteboard')) { this.showNotice('Bảng vẽ và ghi chú đang bị khóa.'); return; }
    if ((kind === 'image' || kind === 'gif' || kind === 'youtube') && !this.canUseCapability('upload')) { this.showNotice('Bạn chưa được cấp quyền thêm nội dung đa phương tiện.'); return; }
    const sizes: Record<CanvasItemKind, [number, number]> = { text: [240, 80], note: [200, 180], image: [280, 180], gif: [280, 180], youtube: [480, 300], whiteboard: [360, 240] };
    const [width, height] = sizes[kind];
    const colors = ['#fff4a8', '#ffd6e8', '#d2f5df', '#d8eaff', '#e8dcff'];
    const scale = this.zoom() / 100;
    const viewport = this.viewportSize();
    const item: CanvasItem = { id: crypto.randomUUID(), kind, content: kind === 'text' ? 'Headline' : '', x: Math.round((viewport.width / 2 - this.pan().x) / scale - width / 2), y: Math.round((viewport.height / 2 - this.pan().y) / scale - height / 2), width, height, z: this.nextCanvasZ(), ownerId: this.auth.currentUser()?.id, color: colors[Math.floor(Math.random() * colors.length)], url: kind === 'gif' ? 'https://media.giphy.com/media/3o7TKsQ8gqVrxZZkly/giphy.gif' : undefined, label: kind === 'image' ? 'Hình ảnh mới' : undefined, strokes: kind === 'whiteboard' ? [] : undefined };
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
  updateInk(strokes: InkStroke[]): void {
    if (!this.canUseCapability('whiteboard')) return;
    this.inkStrokes.set(strokes);
    void this.media.sendRealtime({ type: 'ink', payload: strokes }, false);
  }
  commitInk(strokes: InkStroke[]): void {
    if (!this.canUseCapability('whiteboard')) return;
    this.inkStrokes.set(strokes);
    void this.media.sendRealtime({ type: 'ink', payload: strokes });
  }
  canManageItem(item: CanvasItem): boolean {
    const ownsItem = this.currentRole() !== 'member' || !item.ownerId || item.ownerId === this.auth.currentUser()?.id;
    if (!ownsItem) return false;
    if (item.kind === 'whiteboard' || item.kind === 'note' || item.kind === 'text') return this.canUseCapability('whiteboard');
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
    if (this.focusLocked()) return;
    const item = this.canvasItems().find(current => current.id === id);
    if (!item) return;
    this.selectedItemId.set(id);
    if (!this.canManageItem(item)) return;
    this.commitCanvasItem(id, { z: this.nextCanvasZ() });
  }
  private nextCanvasZ(): number { return Math.max(10, this.memberZ(), ...this.canvasItems().map(item => item.z || 1)) + 1; }
  openChat(): void {
    if (this.focusLocked()) { this.showNotice('Chat bị khóa trong phiên tập trung.'); return; }
    if (!this.canUseCapability('chat')) { this.showNotice('Chat đang bị khóa cho thành viên.'); return; }
    this.chatOpen.update(open => !open);
  }
  selectPointerTool(): void {
    this.penMode.set(false);
    this.penOptionsOpen.set(false);
  }
  togglePenTool(): void {
    if (!this.canUseCapability('whiteboard')) {
      this.showNotice('Whiteboard đang bị khóa cho thành viên.');
      return;
    }
    if (this.penMode()) {
      this.penOptionsOpen.update(open => !open);
      return;
    }
    this.penMode.set(true);
    this.penOptionsOpen.set(true);
  }
  updateRoomPermissions(permissions: RoomPermissions): void {
    this.roomPermissions.set(permissions);
    if (!this.canUseCapability('chat')) this.chatOpen.set(false);
    if (!this.canUseCapability('whiteboard')) this.selectPointerTool();
    void this.media.sendRealtime({ type: 'permissions', payload: permissions });
  }
  applyLoadedPermissions(permissions: RoomPermissions): void {
    this.roomPermissions.set(permissions);
    if (!this.canUseCapability('chat')) this.chatOpen.set(false);
    if (!this.canUseCapability('whiteboard')) this.selectPointerTool();
  }
  beginCanvasGesture(event: PointerEvent, kind: 'pan' | 'member' | 'timer' | 'screen' | 'screen-resize'): void {
    if ((this.focusLocked() && (kind === 'member' || kind === 'screen' || kind === 'screen-resize')) || (this.penMode() && (kind === 'pan' || kind === 'member' || kind === 'screen')) || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, app-canvas-item') && kind !== 'screen-resize') return;
    if (kind === 'pan' && target.closest('.top-bar,.navigator,.floating-dock,.focus-overlay,.permission-notice,.media-error,app-add-to-canvas-menu,app-lofi-player,app-reaction-picker,app-chat-panel,app-room-control-panel,app-ink-layer,.confirm-shade,app-participant-popover')) return;
    if (kind === 'pan' && target.closest('.user-bubble, .pomodoro-widget, .shared-screen')) return;
    if (kind === 'pan') this.selectedItemId.set(null);
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
    if (gesture.kind === 'pan') this.pan.set(next);
    else if (gesture.kind === 'member') {
      this.memberPosition.set(next);
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
    this.moveCanvasGesture(event);
    if (this.canvasGesture || this.penMode()) return;
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
    const gesture = this.canvasGesture;
    if (gesture?.pointerId !== event.pointerId) return;
    this.canvasGesture = null;
    if (gesture.kind === 'screen' || gesture.kind === 'screen-resize') { this.broadcastScreenState(true); return; }
    if (gesture.kind !== 'member') return;
    this.broadcastParticipantPosition(this.memberPosition());
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    const roomId = this.roomId();
    this.studyRoomService.updatePosition(roomId, userId, this.memberPosition()).subscribe({
      next: position => { if (roomId === this.roomId()) this.memberPosition.set(position); },
      error: () => { if (roomId === this.roomId()) this.showNotice('Không thể lưu vị trí trên canvas.'); },
    });
  }
  handleWheel(event: WheelEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.top-bar,.navigator,.floating-dock,.focus-overlay,.permission-notice,.media-error,app-add-to-canvas-menu,app-lofi-player,app-reaction-picker,app-chat-panel,app-room-control-panel,app-ink-layer,.confirm-shade,app-participant-popover')) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.95 : 1.05;
    this.zoom.set(Math.max(30, Math.min(300, Math.round(this.zoom() * factor))));
  }
  miniMapPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.miniMapDragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
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
    void this.media.sendRealtime({ type: 'timer', payload: { mode: this.timerMode(), timeLeft: this.timeLeft(), isRunning: this.isRunning() } });
  }
  private broadcastMediaState(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    void this.media.sendRealtime({ type: 'media-state', payload: { userId, micOn: this.micOn(), camOn: this.camOn() } }, false);
  }
  private broadcastParticipantPosition(position: { x: number; y: number }): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    void this.media.sendRealtime({ type: 'participant-position', payload: { userId, position } }, false);
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
      this.broadcastMediaState();
      if (this.sharingScreen()) this.broadcastScreenState(true);
      const ownerPresent = this.participants().some(person => person.role === 'owner' && !person.isSelf);
      if (this.currentRole() === 'member' || (this.currentRole() === 'moderator' && ownerPresent)) return;
      void this.media.sendRealtime({ type: 'canvas-snapshot', payload: { items: this.canvasItems(), ink: this.inkStrokes(), timer: { mode: this.timerMode(), timeLeft: this.timeLeft(), isRunning: this.isRunning() } } });
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
    if (event.type === 'ink') {
      if (this.isInkSnapshot(event.payload) && this.canPeerUseWhiteboard(senderId)) this.inkStrokes.set(event.payload);
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
        this.messages.update(messages => [...messages.filter(item => item.id !== message.id), received]);
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
      const payload = event.payload as { userId?: string; position?: { x?: number; y?: number } };
      if (!payload.userId || payload.userId !== senderId || typeof payload.position?.x !== 'number' || typeof payload.position.y !== 'number') return;
      this.participants.update(participants => participants.map(person => person.userId === payload.userId ? { ...person, position: { x: payload.position!.x as number, y: payload.position!.y as number } } : person));
      return;
    }
    if (event.type === 'screen-state') {
      const layout = event.payload as { userId?: string; active?: boolean; x?: number; y?: number; width?: number; height?: number };
      if (!layout.userId || layout.userId !== senderId || typeof layout.active !== 'boolean' || typeof layout.x !== 'number' || typeof layout.y !== 'number' || typeof layout.width !== 'number' || typeof layout.height !== 'number') return;
      this.remoteScreenLayouts.update(layouts => ({ ...layouts, [layout.userId as string]: { active: layout.active as boolean, x: layout.x as number, y: layout.y as number, width: Math.max(320, layout.width as number), height: Math.max(180, layout.height as number) } }));
      return;
    }
    if (event.type === 'timer') { this.applyRemoteTimer(event.payload); return; }
    if (event.type === 'canvas-snapshot') {
      const payload = event.payload as { items?: CanvasItem[]; ink?: InkStroke[]; timer?: unknown; mediaState?: unknown };
      if (!this.isAuthoritativeSnapshotSender(senderId)) return;
      if (Array.isArray(payload.items)) this.canvasItems.set(payload.items.filter(item => this.isCanvasItem(item)));
      if (this.isInkSnapshot(payload.ink)) this.inkStrokes.set(payload.ink);
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
    const kinds: CanvasItemKind[] = ['text', 'note', 'image', 'gif', 'youtube', 'whiteboard'];
    return typeof item.id === 'string' && item.id.length > 0
      && !!item.kind && kinds.includes(item.kind)
      && typeof item.x === 'number' && Number.isFinite(item.x)
      && typeof item.y === 'number' && Number.isFinite(item.y)
      && typeof item.width === 'number' && Number.isFinite(item.width) && item.width > 0
      && typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0;
  }
  private isInkSnapshot(value: unknown): value is InkStroke[] {
    return Array.isArray(value) && value.every(stroke => {
      if (!stroke || typeof stroke !== 'object') return false;
      const candidate = stroke as Partial<InkStroke>;
      return typeof candidate.id === 'string' && typeof candidate.color === 'string'
        && typeof candidate.width === 'number' && Number.isFinite(candidate.width) && candidate.width > 0
        && Array.isArray(candidate.points) && candidate.points.every(point =>
          !!point && typeof point.x === 'number' && Number.isFinite(point.x)
          && typeof point.y === 'number' && Number.isFinite(point.y));
    });
  }
  private canPeerUseWhiteboard(senderId: string): boolean {
    const role = this.peerRole(senderId);
    return role === 'owner' || role === 'moderator' || (role === 'member' && !this.roomPermissions().whiteboardLocked);
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
    if (!value || typeof value !== 'object') return;
    const timer = value as { mode?: 'focus' | 'break'; timeLeft?: number; isRunning?: boolean };
    if (timer.mode !== 'focus' && timer.mode !== 'break') return;
    if (typeof timer.timeLeft !== 'number' || typeof timer.isRunning !== 'boolean') return;
    this.stopTimer();
    this.timerMode.set(timer.mode);
    this.timeLeft.set(Math.max(0, timer.timeLeft));
    if (timer.isRunning) this.startTimer();
  }
  leaveRoom(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId || this.leaving) return;
    this.leaving = true;
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
  async copyLink(): Promise<void> {
    try { await navigator.clipboard.writeText(location.href); this.showNotice('Đã sao chép link mời vào phòng.'); }
    catch { this.showNotice('Không thể sao chép link phòng trên trình duyệt này.'); }
  }

  inviteByEmailOrPhone(): void {
    if (this.inviting()) return;
    const emailOrPhone = window.prompt('Nhập email hoặc số điện thoại người bạn muốn mời:')?.trim();
    if (!emailOrPhone) return;

    this.inviting.set(true);
    this.studyRoomService.invite(this.roomId(), emailOrPhone)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.inviting.set(false);
          this.showNotice(response.message || 'Đã gửi lời mời tham gia phòng học.');
        },
        error: error => {
          this.inviting.set(false);
          const message = (error?.error as { message?: string } | null)?.message;
          this.showNotice(message || 'Không thể gửi lời mời. Vui lòng thử lại.');
        },
      });
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
    this.participants.update(participants => participants.filter(person => person.userId !== participantId));
    this.remoteCursors.update(cursors => this.withoutRecordKey(cursors, participantId));
    this.remoteMediaStates.update(states => this.withoutRecordKey(states, participantId));
    this.remoteScreenLayouts.update(layouts => this.withoutRecordKey(layouts, participantId));
    if (this.selectedParticipantId() === participantId) this.selectedParticipantId.set(null);
  }
  private buildMiniMapModel(): MiniMapModel {
    const miniWidth = 132;
    const miniHeight = 86;
    const zoom = this.zoom() / 100;
    const viewportSize = this.viewportSize();
    const viewport = { left: -this.pan().x / zoom, top: -this.pan().y / zoom, right: (-this.pan().x + viewportSize.width) / zoom, bottom: (-this.pan().y + viewportSize.height) / zoom };
    const source: Array<{ left: number; top: number; right: number; bottom: number; kind: MiniMapRect['kind'] }> = [
      ...this.canvasItems().map(item => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height, kind: 'item' as const })),
      ...this.participants().filter(person => !person.isSelf).map(person => ({ left: person.position.x, top: person.position.y, right: person.position.x + 96, bottom: person.position.y + 118, kind: 'member' as const })),
      { left: this.memberPosition().x, top: this.memberPosition().y, right: this.memberPosition().x + 96, bottom: this.memberPosition().y + 118, kind: 'member' },
      { left: this.timerPosition().x, top: this.timerPosition().y, right: this.timerPosition().x + 300, bottom: this.timerPosition().y + 170, kind: 'timer' },
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
    const miniX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const miniY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
    const worldX = (miniX - model.offsetX) / model.scale + model.bounds.left;
    const worldY = (miniY - model.offsetY) / model.scale + model.bounds.top;
    const zoom = this.zoom() / 100;
    const viewport = this.viewportSize();
    this.pan.set({ x: viewport.width / 2 - worldX * zoom, y: viewport.height / 2 - worldY * zoom });
  }
}
