export interface StudyRoomItem {
  roomId: string;
  name: string;
  type: 'public' | 'private';
  maxUsers: number;
  currentUsers: number;
  status: 'focus' | 'break' | 'idle';
  tags: string[];
  category: string;
  theme: string;
  description: string;
  rating?: number;
  creator?: string;
  waitlistCount?: number;
  password?: string;
  requiresPassword?: boolean;
  inviteMode?: 'open' | 'password' | 'approval';
  approvalRequired?: boolean;
  joinRequests?: StudyRoomJoinRequest[];
}

export interface StudyRoomJoinRequest {
  userId: string;
  userName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
}

export interface PomodoroConfig {
  focusTime: number; // minutes
  shortBreak: number;
  longBreak: number;
}
