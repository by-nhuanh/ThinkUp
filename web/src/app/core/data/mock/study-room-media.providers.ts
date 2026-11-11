import { Injectable, Provider } from '@angular/core';
import { StudyRoomMediaService } from '../../../features/study-room/services/study-room-media.service';
import { RoomConnection } from '../../../features/study-room/services/study-room.service';

// TODO(pre-deploy): Nhớ xóa media demo sau khi kiểm thử LiveKit thật.
@Injectable()
class DemoStudyRoomMedia extends StudyRoomMediaService {
  override async connect(_connection: RoomConnection): Promise<void> { this.connected.set(true); }
  override async dispose(): Promise<void> { this.connected.set(false); this.error.set(''); }
  override async toggleMic(): Promise<void> { this.showDemoNotice(); }
  override async toggleCamera(): Promise<void> { this.showDemoNotice(); }
  override async toggleScreen(): Promise<void> { this.showDemoNotice(); }
  private showDemoNotice() { this.error.set('Thiết bị và kết nối nhiều người cần phòng LiveKit thật.'); }
}

export const studyRoomMediaProviders: Provider[] = [{ provide: StudyRoomMediaService, useClass: DemoStudyRoomMedia }];
