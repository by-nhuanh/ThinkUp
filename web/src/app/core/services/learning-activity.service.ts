import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface LearningActivitySession {
  session_id: string;
  state: 'ready' | 'tracking' | 'paused' | 'finished' | 'expired';
  sequence: number;
  next_sequence: number | null;
  heartbeat_seconds: number;
}

@Injectable({ providedIn: 'root' })
export class LearningActivityService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/user/learning-activity`;
  private session: LearningActivitySession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler = () => void this.setActive(!document.hidden);
  private generation = 0;
  private pendingEvent: Promise<void> = Promise.resolve();

  async startLesson(courseId: string, lessonId: string): Promise<void> {
    await this.start(`${environment.apiUrl}/user/lessons/${encodeURIComponent(lessonId)}/activity-session`, { course_id: courseId }, true);
  }

  async startFlashcard(listId: string): Promise<void> {
    await this.start(`${environment.apiUrl}/user/flashcards/${encodeURIComponent(listId)}/activity-session`, {}, true);
  }

  async startRoadmapQuiz(stageId: string): Promise<void> {
    await this.start(`${environment.apiUrl}/user/roadmap/stage-test/${encodeURIComponent(stageId)}/activity-session`, {}, true);
  }

  async finish(): Promise<void> {
    await this.pendingEvent;
    this.stopTimer();
    const current = this.session;
    this.session = null;
    this.generation++;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    if (current && current.state !== 'finished' && current.state !== 'expired' && current.next_sequence != null) {
      await this.event(current, 'finish', { sequence: current.next_sequence });
    }
  }

  private async start(url: string, body: Record<string, unknown>, active: boolean): Promise<void> {
    await this.finish();
    const generation = ++this.generation;
    try {
      const result = await firstValueFrom(this.http.post<{ data: LearningActivitySession }>(url, body));
      if (generation !== this.generation) {
        if (result.data.next_sequence != null) await this.event(result.data, 'finish', { sequence: result.data.next_sequence });
        return;
      }
      this.session = result.data;
      document.addEventListener('visibilitychange', this.visibilityHandler);
      await this.setActive(active && !document.hidden);
      if (generation !== this.generation) return;
      this.timer = setInterval(() => void this.heartbeat(), Math.max(10000, result.data.heartbeat_seconds * 1000));
    } catch (error) {
      if (generation === this.generation) console.warn('[Learning activity] Session could not be started.');
    }
  }

  private setActive(active: boolean): Promise<void> {
    const update = this.pendingEvent.then(async () => {
      const current = this.session;
      if (!current || current.next_sequence == null || ['finished', 'expired'].includes(current.state)) return;
      const action = active ? 'heartbeat' : 'pause';
      const payload = active ? { sequence: current.next_sequence, active: true } : { sequence: current.next_sequence };
      const updated = await this.event(current, action, payload);
      if (updated && this.session?.session_id === current.session_id) this.session = updated;
    });
    this.pendingEvent = update.catch(() => undefined);
    return update;
  }

  private async heartbeat(): Promise<void> {
    if (document.hidden) return;
    await this.setActive(true);
  }

  private async event(current: LearningActivitySession, action: 'heartbeat' | 'pause' | 'finish', body: Record<string, unknown>): Promise<LearningActivitySession | null> {
    try {
      const response = await firstValueFrom(this.http.post<{ data: LearningActivitySession }>(`${this.base}/sessions/${encodeURIComponent(current.session_id)}/${action}`, body));
      return response.data;
    } catch (error: any) {
      if (error?.status === 409) {
        try {
          const latest = await firstValueFrom(this.http.get<{ data: LearningActivitySession }>(`${this.base}/sessions/${encodeURIComponent(current.session_id)}`));
          if (action === 'finish' && latest.data.next_sequence != null && !['finished', 'expired'].includes(latest.data.state)) {
            const response = await firstValueFrom(this.http.post<{ data: LearningActivitySession }>(
              `${this.base}/sessions/${encodeURIComponent(current.session_id)}/finish`,
              { sequence: latest.data.next_sequence },
            ));
            return response.data;
          }
          return latest.data;
        } catch { /* Preserve the session state until the next lifecycle event. */ }
      }
      return null;
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
