import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Provider, computed, inject, signal } from '@angular/core';
import { Observable, delay, of, switchMap, throwError } from 'rxjs';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { StudyRoomItem, StudyRoomJoinRequest } from '../../../features/study-room/models/study-room.model';
import { DemoRoomSettings, RoomEntryRequest, RoomEntryRequestKind, StudyRoomExtras } from '../../../features/study-room/services/study-room-extras';
import { OwnerDeparture, RoomConnection, RoomDetailsUpdate, RoomMessage, RoomParticipant, RoomPermissions, StudyRoomListOptions, StudyRoomService } from '../../../features/study-room/services/study-room.service';

// TODO(pre-deploy): Nhớ xóa các phòng và tài khoản demo sau khi hợp đồng danh sách chờ và upload đã được nghiệm thu.
const user: User = { id: 'demo-learner', full_name: 'Nguyễn Khánh Linh', avatar: '/assets/study-room/demo-avatars/khanh-linh.jpg', email: 'demo@example.invalid', role: 'student' };

const demoChat: RoomMessage[] = [
  { id: 'demo-chat-1', senderId: 'demo-peer', senderName: 'Trần Đức Minh', content: 'Mọi người đọc đến chương 3 chưa? Mình muốn trao đổi đoạn nói về thói quen nhỏ.', createdAt: '2026-01-01T02:00:00Z' },
  { id: 'demo-chat-2', senderId: user.id, senderName: user.full_name, content: 'Mình vừa đọc xong. Mỗi người ghi lại một ý hay rồi cuối phiên chia sẻ nhé.', createdAt: '2026-01-01T02:01:00Z' },
  { id: 'demo-chat-3', senderId: 'demo-peer-2', senderName: 'Lê Gia Huy', content: 'Mình sẽ ghi câu trích dẫn mình thích lên bảng.', createdAt: '2026-01-01T02:02:00Z' },
  { id: 'demo-chat-4', senderId: 'demo-peer-2', senderName: 'Lê Gia Huy', content: 'Bắt đầu phiên tập trung 25 phút nha.', createdAt: '2026-01-01T02:02:30Z' },
  { id: 'demo-chat-5', senderId: user.id, senderName: user.full_name, content: 'Ok, hẹn mọi người lúc nghỉ ngắn!', createdAt: '2026-01-01T02:03:00Z' },
];

function fixture(roomId: string, name: string, details: Partial<StudyRoomItem> = {}): StudyRoomItem {
  return {
    roomId, name, type: 'public', maxUsers: 4, currentUsers: 1, status: 'focus',
    tags: ['Lập trình'], category: 'Lập trình', theme: 'white', description: 'Phòng dùng để kiểm tra giao diện.',
    ...details,
  };
}

const rooms = [
  fixture('demo-open', 'Phòng demo · Thành viên', { description: 'Vào phòng với quyền thành viên thông thường.' }),
  fixture('demo-password', 'Phòng có mật khẩu', { type: 'private', requiresPassword: true }),
  fixture('demo-full', 'Phòng hết chỗ', { currentUsers: 4 }),
  fixture('demo-waitlist', 'Phòng có danh sách chờ', { currentUsers: 4, waitlistEnabled: true }),
  fixture('demo-retry', 'Danh sách chờ · thử lại', { currentUsers: 4, waitlistEnabled: true, category: 'Tự học', tags: ['Tự học'] }),
  fixture('demo-approval', 'Phòng cần phê duyệt', { type: 'private', inviteMode: 'approval' }),
  fixture('demo-rejected', 'Yêu cầu bị từ chối', { type: 'private', inviteMode: 'approval' }),
  fixture('demo-owner', 'Góc đọc sách buổi tối', {
    type: 'private', requiresPassword: true,
    category: 'Đọc sách',
    tags: ['Đọc sách', 'Thói quen nguyên tử'],
    description: 'Đọc chương 3 của Thói quen nguyên tử trong 25 phút, rồi chia sẻ một ý hay với cả nhóm.',
    approvalRequired: true, currentUsers: 3, creator: user.id,
    joinRequests: [
      { userId: 'demo-applicant', userName: 'Phạm Minh Anh', avatar: '/assets/study-room/demo-avatars/minh-anh.jpg', status: 'pending', requestedAt: '2026-01-01T08:00:00Z' },
      { userId: 'demo-applicant-2', userName: 'Vũ Hoàng Nam', avatar: '/assets/study-room/demo-avatars/hoang-nam.jpg', status: 'pending', requestedAt: '2026-01-01T08:01:00Z' },
      { userId: 'demo-applicant-3', userName: 'Đỗ Thanh Hà', avatar: '/assets/study-room/demo-avatars/thanh-ha.jpg', status: 'pending', requestedAt: '2026-01-01T08:02:00Z' },
    ],
  }),
];

function failure(code: string, message: string, roomId?: string): Observable<never> {
  return throwError(() => new HttpErrorResponse({ status: 409, error: { code, message, room: { roomId } } }));
}

@Injectable()
class DemoStudyRoomAuth extends AuthService {
  private readonly demoUser = signal<User | null>(user);
  override readonly currentUser = this.demoUser.asReadonly();

  override isAuthenticated(): boolean { return !!this.currentUser(); }
  override getToken(): string | null { return null; }
  override validateSession(): Observable<boolean> { return of(this.isAuthenticated()); }
  override getMe(): Observable<User> {
    const currentUser = this.currentUser();
    return currentUser ? of(currentUser) : throwError(() => new Error('Phiên demo đã đăng xuất.'));
  }
  override logout(): Observable<void> {
    this.demoUser.set(null);
    return of(undefined);
  }
}

@Injectable()
class DemoStudyRoomExtras extends StudyRoomExtras {
  override readonly demo = true;
  override readonly waitlistAvailable = true;
  private readonly settings = signal<Record<string, DemoRoomSettings>>({});
  override roomSettings(roomId: string): DemoRoomSettings {
    return this.settings()[roomId] ?? super.roomSettings(roomId);
  }

  override updateRoomSettings(roomId: string, patch: Partial<DemoRoomSettings>): void {
    this.settings.update(current => ({ ...current, [roomId]: { ...this.roomSettings(roomId), ...patch } }));
  }

  private readonly statuses = new Map<string, RoomEntryRequest>();
  private failedOnce = false;

  state(roomId: string, kind: RoomEntryRequestKind): RoomEntryRequest | undefined {
    return this.statuses.get(`${kind}:${roomId}`);
  }

  override entryRequest(roomId: string, kind: RoomEntryRequestKind, submit: boolean): Observable<RoomEntryRequest> {
    const key = `${kind}:${roomId}`;
    const previous = this.statuses.get(key);
    if (submit && roomId === 'demo-retry' && !this.failedOnce) {
      this.failedOnce = true;
      return throwError(() => new Error('Lỗi mô phỏng. Hãy gửi lại yêu cầu.'));
    }
    const state: RoomEntryRequest = previous && !submit && previous.status === 'pending'
      ? { status: roomId === 'demo-rejected' ? 'rejected' : 'approved' }
      : previous ?? { status: 'pending' };
    this.statuses.set(key, state);
    return of(state).pipe(delay(150));
  }

  override async uploadImage(_file: File): Promise<string> {
    return '/assets/study-room/lobby-hero-poster.webp';
  }
}

@Injectable()
class DemoStudyRoomService extends StudyRoomService {
  private readonly extras = inject(DemoStudyRoomExtras);
  private readonly records = signal<StudyRoomItem[]>(structuredClone(rooms));
  private readonly results = signal<StudyRoomItem[]>([]);
  private readonly positions = new Map<string, { x: number; y: number }>();
  private readonly ownerByRoom = new Map<string, string>();
  private readonly joined = signal<Record<string, StudyRoomItem>>({});
  private readonly passwords = new Map<string, string>([["demo-password", "1234"], ["demo-owner", crypto.randomUUID().slice(0, 8)]]);
  private readonly history = new Map<string, RoomMessage[]>([['demo-owner', [...demoChat]]]);
  private readonly permissionOverrides = new Map<string, RoomPermissions>();
  private readonly defaultPermissions: RoomPermissions = {
    voiceEnabled: true, cameraEnabled: true, chatEnabled: true, whiteboardLocked: false,
    participantShareScreen: true, participantUpload: true, approvalRequired: false,
  };
  private failedChat = false;
  override readonly rooms = computed(() => this.results());

  override loadRooms(options: StudyRoomListOptions = {}) {
    const query = options.search?.trim().toLowerCase();
    return this.list(this.records().filter(room =>
      (!query || [room.name, room.description, room.category, ...room.tags].some(value => value.toLowerCase().includes(query))) &&
      (!options.topic || room.tags.includes(options.topic)) &&
      (options.tab !== 'active' || room.status !== 'idle') &&
      (options.tab !== 'available' || room.currentUsers < room.maxUsers)));
  }

  override filterRooms(tag = '', status: 'new' | 'available' | 'active' | '' = '') {
    return this.loadRooms({ topic: tag, tab: status || undefined });
  }

  override filterByTags(tags: readonly string[]) {
    return this.list(this.records().filter(room => tags.some(tag => room.tags.includes(tag))));
  }

  override popularTags() {
    return of({ topTags: [{ name: 'Lập trình', count: 7 }, { name: 'Tự học', count: 1 }] });
  }

  override randomSpawn() { return of(this.records()[0]); }
  override getRoomById(roomId: string) { return this.records().find(room => room.roomId === roomId) ?? null; }
  override getJoinedRoom(roomId: string) { return this.joined()[roomId] ?? null; }
  override clearJoinedRoom(roomId: string) {
    this.joined.update(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== roomId)));
  }

  override joinRoom(codeOrLink: string, password = '') {
    const roomId = codeOrLink.trim().split(/[?#]/)[0].split('/').filter(Boolean).at(-1) ?? '';
    const room = this.getRoomById(roomId);
    if (!room) return failure('ROOM_MISSING', 'Không tìm thấy phòng demo.');
    if (this.extras.roomSettings(roomId).locked && this.role(roomId) !== 'owner') {
      return failure('ROOM_LOCKED', 'Chủ phòng đã khóa lượt tham gia mới.', roomId);
    }
    if (room.currentUsers >= room.maxUsers && this.extras.state(roomId, 'waitlist')?.status !== 'approved') {
      return failure('ROOM_FULL', 'Phòng hiện không còn chỗ.', roomId);
    }
    if (this.role(roomId) !== 'owner' && (room.inviteMode === 'approval' || room.approvalRequired)
      && this.extras.state(roomId, 'approval')?.status !== 'approved'
      && !room.joinRequests?.some(request => request.userId === user.id && request.status === 'approved')) {
      return failure('APPROVAL_REQUIRED', 'Chủ phòng cần duyệt yêu cầu.', roomId);
    }
    if (this.role(roomId) !== 'owner' && room.requiresPassword && password !== this.passwords.get(roomId)) {
      return failure('PASSWORD_REQUIRED', roomId === 'demo-password' ? 'Mật khẩu phòng demo là 1234.' : 'Nhập đúng mật khẩu phòng demo.', roomId);
    }
    return this.join(room);
  }

  override createRoom(request: Parameters<StudyRoomService['createRoom']>[0]) {
    const room = fixture(crypto.randomUUID(), request.name, {
      type: request.type, maxUsers: request.capacity, currentUsers: 1, description: request.goal,
      tags: request.tags, category: request.topic, theme: request.roomTheme, requiresPassword: !!request.password,
    });
    if (request.password) this.passwords.set(room.roomId, request.password);
    this.records.update(current => [room, ...current]);
    return this.join(room);
  }

  override prepareConnection(roomId: string, userId: string, name: string) { return this.connection(roomId, userId, name); }
  override connection(roomId: string, _userId: string, _name: string): Observable<RoomConnection> {
    return of({ roomId, token: '', livekitUrl: '', role: this.role(roomId), position: this.positions.get(roomId) ?? { x: 280, y: 180 } });
  }

  override participants(roomId: string): Observable<RoomParticipant[]> {
    const selfRole = this.role(roomId);
    const members: RoomParticipant[] = [
      { userId: user.id, name: user.full_name, displayName: user.full_name, initials: 'KL', avatar: user.avatar ?? '', role: selfRole, roleLabel: selfRole === 'owner' ? 'Chủ phòng' : 'Thành viên', isSelf: true, position: this.positions.get(roomId) ?? { x: 280, y: 180 } },
      { userId: 'demo-peer', name: 'Trần Đức Minh', displayName: 'Trần Đức Minh', initials: 'ĐM', avatar: '/assets/study-room/demo-avatars/duc-minh.jpg', role: 'member', roleLabel: 'Thành viên', isSelf: false, position: { x: 475, y: 200 } },
    ];
    if (roomId === 'demo-owner') {
      members.push({ userId: 'demo-peer-2', name: 'Lê Gia Huy', displayName: 'Lê Gia Huy', initials: 'GH', avatar: '/assets/study-room/demo-avatars/gia-huy.jpg', role: 'member', roleLabel: 'Thành viên', isSelf: false, position: { x: 650, y: 225 } });
    }
    const ownerId = this.ownerByRoom.get(roomId);
    return of(members.map<RoomParticipant>(member => member.userId === ownerId ? { ...member, role: 'owner', roleLabel: 'Chủ phòng' } : member));
  }

  private roomPermissions(roomId: string): RoomPermissions {
    const room = this.getRoomById(roomId);
    return this.permissionOverrides.get(roomId) ?? {
      ...this.defaultPermissions,
      approvalRequired: !!room?.approvalRequired || room?.inviteMode === 'approval',
    };
  }

  override permissions(roomId: string, _userId: string): ReturnType<StudyRoomService['permissions']> {
    const owner = this.role(roomId) === 'owner';
    return of({ role: this.role(roomId), roomPermissions: this.roomPermissions(roomId), effectivePermissions: { canManagePermissions: owner, canChangeTheme: owner }, permissionMatrix: [] });
  }

  override updatePermissions(roomId: string, patch: Partial<RoomPermissions>) {
    if (this.role(roomId) !== 'owner') return failure('FORBIDDEN', 'Chỉ chủ phòng có thể thay đổi quyền.');
    const updated = { ...(this.roomPermissions(roomId)), ...patch };
    this.permissionOverrides.set(roomId, updated);
    if (patch.approvalRequired !== undefined) {
      const change = (room: StudyRoomItem): StudyRoomItem => ({
        ...room,
        approvalRequired: updated.approvalRequired,
        inviteMode: room.inviteMode === 'approval' && !updated.approvalRequired
          ? (room.requiresPassword ? 'password' : 'open') : room.inviteMode,
      });
      this.records.update(current => current.map(room => room.roomId === roomId ? change(room) : room));
      this.joined.update(current => current[roomId] ? { ...current, [roomId]: change(current[roomId]) } : current);
    }
    return of(updated);
  }

  override handleJoinRequest(roomId: string, targetUserId: string, action: 'approve' | 'reject') {
    const room = this.getRoomById(roomId);
    if (!room) return failure('ROOM_MISSING', 'Phòng không tồn tại.');
    if (this.role(roomId) !== 'owner') return failure('FORBIDDEN', 'Chỉ chủ phòng có thể xử lý yêu cầu.');
    if (!room.joinRequests?.some(request => request.userId === targetUserId && request.status === 'pending')) {
      return failure('REQUEST_NOT_PENDING', 'Yêu cầu đã được xử lý hoặc không tồn tại.');
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const joinRequests = room.joinRequests.map<StudyRoomJoinRequest>(request =>
      request.userId === targetUserId && request.status === 'pending' ? { ...request, status } : request);
    this.records.update(current => current.map(item => item.roomId === roomId ? { ...item, joinRequests } : item));
    this.joined.update(current => current[roomId]
      ? { ...current, [roomId]: { ...current[roomId], joinRequests } }
      : current);
    return of({ message: status === 'approved' ? 'Đã duyệt yêu cầu.' : 'Đã từ chối yêu cầu.' });
  }

  override messages(roomId: string) { return of(this.history.get(roomId) ?? []); }
  override sendMessage(roomId: string, userId: string, senderName: string, content: string) {
    if (!this.failedChat && content === 'thử lỗi chat') {
      this.failedChat = true;
      return failure('CHAT_FAILED', 'Lỗi gửi tin nhắn mô phỏng.');
    }
    const message = { id: crypto.randomUUID(), senderId: userId, senderName, content, createdAt: new Date().toISOString() };
    this.history.set(roomId, [...(this.history.get(roomId) ?? []), message]);
    return of(message);
  }

  override leaveAsOwner(roomId: string, decision: OwnerDeparture) {
    if (!this.getRoomById(roomId) || this.role(roomId) !== 'owner') {
      return failure('FORBIDDEN', 'Chỉ chủ phòng hiện tại có thể thực hiện thao tác này.');
    }
    if (decision.kind === 'close') {
      this.records.update(rooms => rooms.filter(room => room.roomId !== roomId));
      this.results.update(rooms => rooms.filter(room => room.roomId !== roomId));
      this.clearJoinedRoom(roomId);
      return of(null);
    }
    return this.participants(roomId).pipe(switchMap(members => {
      if (!members.some(member => !member.isSelf && member.userId === decision.successorId)) {
        return failure('MEMBER_MISSING', 'Thành viên được chọn không còn trong phòng.');
      }
      this.ownerByRoom.set(roomId, decision.successorId);
      this.records.update(rooms => rooms.map(room => room.roomId === roomId
        ? { ...room, creator: decision.successorId, currentUsers: Math.max(1, room.currentUsers - 1) }
        : room));
      return of(null);
    }));
  }

  override leaveRoom() { return of(null); }
  override updatePosition(roomId: string, userId: string, position: { x: number; y: number }) {
    if (!this.getRoomById(roomId) || userId !== user.id) return failure('FORBIDDEN', 'Không thể lưu vị trí.');
    this.positions.set(roomId, position);
    return of(position);
  }
  override updateRoomDetails(roomId: string, details: RoomDetailsUpdate) {
    const room = this.getRoomById(roomId);
    if (!room || this.role(roomId) !== 'owner') return failure('FORBIDDEN', 'Chỉ chủ phòng có thể sửa thông tin phòng.');
    const updated = { ...room, description: details.goal, tags: details.tags };
    this.records.update(current => current.map(item => item.roomId === roomId ? updated : item));
    this.results.update(current => current.map(item => item.roomId === roomId ? updated : item));
    this.joined.update(current => current[roomId]
      ? { ...current, [roomId]: { ...current[roomId], description: updated.description, tags: updated.tags } }
      : current);
    return of(updated);
  }

  override readDemoRoomPassword(roomId: string): string | null {
    const room = this.getRoomById(roomId);
    if (room?.type !== 'private' || this.role(roomId) !== 'owner') return null;
    return this.passwords.get(roomId) ?? null;
  }

  override updateRoomPassword(roomId: string, password: string) {
    const room = this.getRoomById(roomId);
    if (room?.type !== 'private' || this.role(roomId) !== 'owner') {
      return failure('FORBIDDEN', 'Chỉ chủ phòng riêng tư có thể đổi mật khẩu.');
    }
    if (password.length < 4 || !password.trim()) return failure('INVALID_PASSWORD', 'Mật khẩu cần ít nhất 4 ký tự.');
    this.passwords.set(roomId, password);
    this.records.update(current => current.map(item => item.roomId === roomId ? { ...item, requiresPassword: true } : item));
    this.results.update(current => current.map(item => item.roomId === roomId ? { ...item, requiresPassword: true } : item));
    this.joined.update(current => current[roomId]
      ? { ...current, [roomId]: { ...current[roomId], requiresPassword: true } }
      : current);
    return of(undefined);
  }

  override renameRoom(roomId: string, name: string) {
    const room = this.getRoomById(roomId);
    if (!room || this.role(roomId) !== 'owner') return failure('FORBIDDEN', 'Chỉ chủ phòng có thể đổi tên.');
    const updated = { ...room, name };
    this.records.update(current => current.map(item => item.roomId === roomId ? updated : item));
    this.results.update(current => current.map(item => item.roomId === roomId ? { ...item, name } : item));
    this.joined.update(current => current[roomId] ? { ...current, [roomId]: { ...current[roomId], name } } : current);
    return of(updated);
  }

  override changeTheme(roomId: string, theme: string) {
    const room = this.getJoinedRoom(roomId);
    if (room) this.joined.update(current => ({ ...current, [roomId]: { ...room, theme } }));
    return of(null);
  }
  override invite() { return failure('DEMO_ONLY', 'Chế độ demo không gửi lời mời.'); }

  private role(roomId: string): RoomConnection['role'] {
    const ownerId = this.ownerByRoom.get(roomId);
    if (ownerId) return ownerId === user.id ? 'owner' : 'member';
    return roomId === 'demo-owner' || !rooms.some(room => room.roomId === roomId) ? 'owner' : 'member';
  }

  private list(available: StudyRoomItem[]) {
    const visibleRooms = available.filter(room => room.type === 'public' || room.creator === user.id);
    this.results.set(visibleRooms);
    return of(visibleRooms);
  }

  private join(room: StudyRoomItem) {
    this.joined.update(current => ({ ...current, [room.roomId]: room }));
    return of(room);
  }
}

export const studyRoomProviders: Provider[] = [
  DemoStudyRoomExtras,
  { provide: StudyRoomExtras, useExisting: DemoStudyRoomExtras },
  { provide: StudyRoomService, useClass: DemoStudyRoomService },
  { provide: AuthService, useClass: DemoStudyRoomAuth },
];
