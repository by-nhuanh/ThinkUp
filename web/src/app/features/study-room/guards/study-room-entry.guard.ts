import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { StudyRoomIdentity } from "../services/study-room-extras";
import { StudyRoomService } from '../services/study-room.service';

export const studyRoomEntryGuard: CanActivateFn = (route, state) => {
  const rooms = inject(StudyRoomService);
  const router = inject(Router);
  const user = inject(StudyRoomIdentity).currentUser();
  const roomId = route.paramMap.get('roomId') || '';
  if (!user) return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  const room = rooms.getJoinedRoom(roomId);
  return (room ? of(room) : rooms.joinRoom(roomId)).pipe(
    switchMap(joined => rooms.prepareConnection(joined.roomId, user.id, user.full_name)),
    map(() => true),
    catchError(error => {
      rooms.clearJoinedRoom(roomId);
      return of(router.createUrlTree(['/learning/study-room'], {
        queryParams: { roomCode: roomId, entryError: error.error?.message || 'Không thể xác thực phòng này. Vui lòng vào phòng bằng mã hoặc mật khẩu.' },
      }));
    }),
  );
};
