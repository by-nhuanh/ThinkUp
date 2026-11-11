export type TimerMode = 'focus' | 'break' | 'long-break';
export type TimerScope = 'personal' | 'group';
export type TimerDurations = Record<TimerMode, number>;

export interface RoomTimer {
  mode: TimerMode;
  timeLeft: number;
  endsAt: number | null;
  completed: number;
  durations: TimerDurations;
  autoAdvance: boolean;
}

export function createRoomTimer(): RoomTimer {
  return { mode: 'focus', timeLeft: 1500, endsAt: null, completed: 0,
    durations: { focus: 25, break: 5, 'long-break': 15 }, autoAdvance: false };
}

export function timerRemaining(timer: RoomTimer, now: number): number {
  return timer.endsAt === null ? timer.timeLeft : Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function finishTimer(timer: RoomTimer, now: number): RoomTimer {
  const completed = timer.completed + (timer.mode === 'focus' ? 1 : 0);
  const mode = timer.mode !== 'focus' ? 'focus' : completed % 4 === 0 ? 'long-break' : 'break';
  const timeLeft = timer.durations[mode] * 60;
  return { ...timer, completed, mode, timeLeft, endsAt: timer.autoAdvance ? now + timeLeft * 1000 : null };
}

export function readRoomTimer(value: unknown, now: number): RoomTimer | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<RoomTimer> & { isRunning?: unknown };
  const { mode, timeLeft } = state;
  if ((mode !== 'focus' && mode !== 'break' && mode !== 'long-break') ||
      typeof timeLeft !== 'number' || !Number.isFinite(timeLeft) || timeLeft < 0 || timeLeft > 7200 ||
      typeof state.isRunning !== 'boolean') return null;
  const defaults = createRoomTimer();
  const durations = state.durations;
  const validDurations = durations && (['focus', 'break', 'long-break'] as const).every(key =>
    Number.isInteger(durations[key]) && durations[key] >= 1 && durations[key] <= 120);
  return {
    mode, timeLeft: Math.ceil(timeLeft),
    endsAt: state.isRunning ? now + timeLeft * 1000 : null,
    completed: Number.isSafeInteger(state.completed) && state.completed! >= 0 ? state.completed! : 0,
    durations: validDurations ? { ...durations } : defaults.durations,
    autoAdvance: state.autoAdvance === true,
  };
}
