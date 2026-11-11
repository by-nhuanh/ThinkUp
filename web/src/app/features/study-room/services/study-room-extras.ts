import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

export interface RoomEntryRequest {
  status: 'pending' | 'approved' | 'rejected';
}

export interface DemoRoomSettings {
  locked: boolean;
  pauseChat: boolean;
}

const defaultRoomSettings: DemoRoomSettings = { locked: false, pauseChat: false };

export type RoomEntryRequestKind = 'waitlist' | 'approval';

@Injectable({ providedIn: 'root' })
export class StudyRoomExtras {
  readonly demo: boolean = false;
  readonly waitlistAvailable: boolean = false;

  roomSettings(_roomId: string): DemoRoomSettings { return defaultRoomSettings; }

  updateRoomSettings(_roomId: string, _patch: Partial<DemoRoomSettings>): void {}

  entryRequest(_roomId: string, _kind: RoomEntryRequestKind, _submit: boolean): Observable<RoomEntryRequest> {
    return throwError(() => new Error('Chưa thể kiểm tra trạng thái yêu cầu.'));
  }

  async uploadImage(_file: File): Promise<string> {
    throw new Error('Tải ảnh từ máy chưa được kết nối. Bạn có thể thêm ảnh bằng URL HTTPS.');
  }
}

@Injectable({ providedIn: 'root' })
export class StudyRoomIdentity {
  private readonly auth = inject(AuthService);
  currentUser() { return this.auth.currentUser(); }
  isAuthenticated(): boolean { return this.auth.isAuthenticated(); }
}
