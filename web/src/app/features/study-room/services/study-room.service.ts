import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { StudyRoomItem } from '../models/study-room.model';

interface RoomPayload extends Partial<StudyRoomItem> {
  roomId: string;
  name: string;
  roomName?: string;
  roomStatus?: StudyRoomItem['status'];
  rawId?: string;
  statusType?: string;
  capacity?: number;
  topic?: string;
  goal?: string;
  roomTheme?: string;
  hasPassword?: boolean;
}
export interface StudyRoomListOptions {
  search?: string;
  topic?: string;
  tab?: 'trending' | 'new' | 'active' | 'available';
  limit?: number;
  skip?: number;
}
export interface PopularRoomTags {
  topTags: { name: string; count: number }[];
  allRoomsCount?: number;
  allRooms?: RoomPayload[];
}
interface RoomCreateRequest {
  name: string;
  type: 'public' | 'private';
  goal: string;
  topic: string;
  tags: string[];
  capacity: number;
  roomTheme: string;
  password?: string;
  creatorName: string;
}
export interface RoomParticipant {
  userId: string; name: string; displayName: string; initials: string;
  avatar: string; role: 'owner' | 'moderator' | 'member';
  roleLabel: string; isSelf: boolean; position: { x: number; y: number };
  currentCourse?: string; progress?: number; isVIP?: boolean;
}
export interface RoomMessage {
  id: string; senderId: string; senderName: string; content: string; createdAt: string;
}
export interface RoomConnection {
  theme?: string;
  token: string; livekitUrl: string; roomId: string; role: 'owner' | 'moderator' | 'member';
  position: { x: number; y: number };
}
export interface RoomPermissions {
  voiceEnabled: boolean; cameraEnabled: boolean; chatEnabled: boolean;
  whiteboardLocked: boolean; participantShareScreen: boolean;
  participantUpload: boolean; approvalRequired: boolean;
}
export interface EffectiveRoomPermissions {
  role: 'owner' | 'moderator' | 'member';
  roomPermissions: RoomPermissions;
  effectivePermissions: { canManagePermissions: boolean; canChangeTheme: boolean };
  permissionMatrix: { feature: string; label: string; owner: boolean; moderator: boolean; member: boolean | string }[];
}

function mapRoom(room: RoomPayload): StudyRoomItem {
  return {
    roomId: room.rawId ?? room.roomId,
    name: room.name ?? room.roomName ?? '',
    type: room.type === 'private' ? 'private' : 'public',
    maxUsers: room.maxUsers ?? room.capacity ?? 20,
    currentUsers: room.currentUsers ?? 0,
    status: room.status ?? room.roomStatus ?? 'idle',
    tags: room.tags ?? [],
    category: room.category ?? room.topic ?? '',
    theme: room.roomTheme || room.theme || 'white',
    description: room.description ?? room.goal ?? '',
    rating: room.rating,
    creator: room.creator,
    waitlistCount: room.waitlistCount,
    requiresPassword: room.requiresPassword ?? room.hasPassword,
    inviteMode: room.inviteMode,
    approvalRequired: room.approvalRequired,
    joinRequests: (room.joinRequests ?? []).filter(request => request.status === 'pending'),
  };
}

@Injectable({ providedIn: 'root' })
export class StudyRoomService {
  private readonly preparedConnections = new Map<string, RoomConnection>();
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/study-room`;
  private readonly roomsSig = signal<StudyRoomItem[]>([]);
  private readonly joinedRoomsSig = signal<Record<string, StudyRoomItem>>({});
  readonly rooms = computed(() => this.roomsSig());

  loadRooms(options: StudyRoomListOptions = {}): Observable<StudyRoomItem[]> {
    let params = new HttpParams().set('limit', options.limit ?? 100).set('skip', options.skip ?? 0);
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    if (options.topic?.trim()) params = params.set('topic', options.topic.trim());
    if (options.tab) params = params.set('tab', options.tab);
    return this.http.get<{ success: boolean; data: RoomPayload[] }>(`${this.base}/cards`, {
      params,
    }).pipe(
      map(response => response.data.map(mapRoom)),
      tap(rooms => this.roomsSig.set(rooms))
    );
  }

  randomSpawn(): Observable<StudyRoomItem> {
    return this.http.get<{ success: boolean; data: RoomPayload }>(`${this.base}/random-spawn`).pipe(
      map(response => mapRoom(response.data))
    );
  }

  searchRooms(name = '', topic = '', includePrivate = false): Observable<StudyRoomItem[]> {
    let params = new HttpParams().set('includePrivate', includePrivate);
    if (name.trim()) params = params.set('name', name.trim());
    if (topic.trim()) params = params.set('topic', topic.trim());
    return this.http.get<{ success: boolean; data: RoomPayload[] }>(`${this.base}/search`, { params }).pipe(
      map(response => response.data.map(mapRoom)),
      tap(rooms => this.roomsSig.set(rooms))
    );
  }

  filterRooms(tag = '', status: 'new' | 'available' | 'active' | '' = '', includePrivate = false): Observable<StudyRoomItem[]> {
    let params = new HttpParams().set('includePrivate', includePrivate);
    if (tag.trim()) params = params.set('tag', tag.trim());
    if (status) params = params.set('status', status);
    return this.http.get<{ success: boolean; data: RoomPayload[] }>(`${this.base}/filter`, { params }).pipe(
      map(response => response.data.map(mapRoom)),
      tap(rooms => this.roomsSig.set(rooms))
    );
  }

  popularTags(includeAllRooms = false): Observable<PopularRoomTags> {
    const params = includeAllRooms ? new HttpParams().set('all', 'true') : undefined;
    return this.http.get<{ success: boolean; data: PopularRoomTags }>(`${this.base}/tags/popular`, { params }).pipe(
      map(response => response.data)
    );
  }

  filterByTags(tags: readonly string[], includePrivate = false): Observable<StudyRoomItem[]> {
    return this.http.post<{ success: boolean; data: RoomPayload[] }>(`${this.base}/filter-by-tags`, { tags: [...tags], includePrivate }).pipe(
      map(response => response.data.map(mapRoom)),
      tap(rooms => this.roomsSig.set(rooms))
    );
  }

  displayList(limit = 50, skip = 0, includePrivate = false): Observable<StudyRoomItem[]> {
    const params = new HttpParams().set('limit', limit).set('skip', skip).set('includePrivate', includePrivate);
    return this.http.get<{ success: boolean; data: RoomPayload[] }>(`${this.base}/display-list`, { params }).pipe(
      map(response => response.data.map(mapRoom)),
      tap(rooms => this.roomsSig.set(rooms))
    );
  }

  invite(roomId: string, emailOrPhone: string): Observable<{ success: boolean; message: string; inviteLink: string }> {
    return this.http.post<{ success: boolean; message: string; inviteLink: string }>(
      `${this.base}/${encodeURIComponent(roomId)}/invite`, { emailOrPhone }
    );
  }

  getRoomById(roomId: string): StudyRoomItem | null {
    return this.roomsSig().find(room => room.roomId === roomId) || null;
  }

  getJoinedRoom(roomId: string): StudyRoomItem | null {
    const inMemory = this.joinedRoomsSig()[roomId];
    if (inMemory) return inMemory;
    try {
      const raw = sessionStorage.getItem(`study_room_joined_${roomId}`);
      if (!raw) return null;
      const room = JSON.parse(raw) as StudyRoomItem;
      if (room?.roomId !== roomId) return null;
      this.joinedRoomsSig.update(rooms => ({ ...rooms, [roomId]: room }));
      return room;
    } catch { return null; }
  }

  clearJoinedRoom(roomId: string): void {
    this.preparedConnections.delete(roomId);
    this.joinedRoomsSig.update(rooms => {
      const next = { ...rooms };
      delete next[roomId];
      return next;
    });
    try { sessionStorage.removeItem(`study_room_joined_${roomId}`); } catch { /* Storage may be unavailable in strict privacy mode. */ }
  }

  createRoom(request: RoomCreateRequest): Observable<StudyRoomItem> {
    return this.http.post<{ success: boolean; data: RoomPayload }>(`${this.base}/create`, request).pipe(
      map(response => mapRoom(response.data)),
      tap(room => this.rememberJoinedRoom(room))
    );
  }

  joinRoom(codeOrLink: string, password = ''): Observable<StudyRoomItem> {
    return this.http.post<{ success: boolean; room: RoomPayload }>(`${this.base}/join`, { codeOrLink, password }).pipe(
      map(response => mapRoom(response.room)),
      tap(room => this.rememberJoinedRoom(room))
    );
  }

  requestJoin(roomId: string, _userId: string, userName: string): Observable<{ message: string }> {
    // The backend derives the requester identity from the authenticated session.
    return this.http.post<{ message: string }>(`${this.base}/${encodeURIComponent(roomId)}/request-join`, { userName });
  }

  handleJoinRequest(roomId: string, targetUserId: string, action: 'approve' | 'reject'): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${encodeURIComponent(roomId)}/handle-request`, { targetUserId, action }).pipe(
      tap(() => {
        const room = this.getJoinedRoom(roomId);
        if (!room) return;
        this.rememberJoinedRoom({ ...room, joinRequests: (room.joinRequests ?? []).filter(request => request.userId !== targetUserId) });
      })
    );
  }

  leaveRoom(roomId: string, _userId: string): Observable<unknown> {
    return this.http.post(`${this.base}/${encodeURIComponent(roomId)}/leave`, {});
  }

  prepareConnection(roomId: string, userId: string, userName: string): Observable<RoomConnection> {
    this.preparedConnections.delete(roomId);
    return this.connection(roomId, userId, userName).pipe(tap(connection => {
      this.preparedConnections.set(roomId, connection);
      if (connection.theme) this.cacheTheme(roomId, connection.theme);
    }));
  }

  connection(roomId: string, _userId: string, userName: string): Observable<RoomConnection> {
    const prepared = this.preparedConnections.get(roomId);
    if (prepared) {
      this.preparedConnections.delete(roomId);
      return of(prepared);
    }
    return this.http.post<{ data: RoomConnection }>(`${this.base}/token`, { roomId, userName }).pipe(
      map(response => response.data)
    );
  }

  participants(roomId: string, _userId: string): Observable<RoomParticipant[]> {
    return this.http.get<{ data: { participants: RoomParticipant[] } }>(`${this.base}/${encodeURIComponent(roomId)}/participants`).pipe(
      map(response => response.data.participants)
    );
  }

  updatePosition(roomId: string, _userId: string, position: { x: number; y: number }): Observable<{ x: number; y: number }> {
    return this.http.put<{ data: { position: { x: number; y: number } } }>(`${this.base}/${encodeURIComponent(roomId)}/position`, {
      x: Math.round(position.x), y: Math.round(position.y),
    }).pipe(map(response => response.data.position));
  }

  messages(roomId: string, _userId: string): Observable<RoomMessage[]> {
    return this.http.get<{ data: RoomMessage[] }>(`${this.base}/${encodeURIComponent(roomId)}/messages`).pipe(
      map(response => response.data.map(message => ({ ...message, id: String(message.id) })))
    );
  }

  sendMessage(roomId: string, _userId: string, _senderName: string, content: string): Observable<RoomMessage> {
    return this.http.post<{ data: RoomMessage }>(`${this.base}/${encodeURIComponent(roomId)}/messages`, {
      content,
    }).pipe(map(response => ({ ...response.data, id: String(response.data.id) })));
  }

  changeTheme(roomId: string, theme: string): Observable<unknown> {
    return this.http.put(`${this.base}/${encodeURIComponent(roomId)}/theme`, { theme }).pipe(
      tap(() => this.cacheTheme(roomId, theme))
    );
  }

  cacheTheme(roomId: string, theme: string): void {
    const room = this.getJoinedRoom(roomId);
    if (room) this.rememberJoinedRoom({ ...room, theme });
  }

  permissions(roomId: string, _userId: string): Observable<EffectiveRoomPermissions> {
    return this.http.get<{ data: EffectiveRoomPermissions }>(`${this.base}/${encodeURIComponent(roomId)}/permissions`).pipe(
      map(response => response.data)
    );
  }

  updatePermissions(roomId: string, permissions: Partial<RoomPermissions>): Observable<RoomPermissions> {
    return this.http.put<{ data: RoomPermissions }>(`${this.base}/${encodeURIComponent(roomId)}/permissions`, permissions).pipe(
      map(response => response.data)
    );
  }

  private rememberRoom(room: StudyRoomItem): void {
    this.roomsSig.update(rooms => [room, ...rooms.filter(item => item.roomId !== room.roomId)]);
  }

  private rememberJoinedRoom(room: StudyRoomItem): void {
    this.rememberRoom(room);
    this.joinedRoomsSig.update(rooms => ({ ...rooms, [room.roomId]: room }));
    try { sessionStorage.setItem(`study_room_joined_${room.roomId}`, JSON.stringify(room)); } catch { /* Keep the in-memory room usable. */ }
  }
}
