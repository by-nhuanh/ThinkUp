import { Component, OnDestroy, OnInit, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

interface CacheServer {
  name: string;
  done: boolean;
}

@Component({
  selector: 'app-system-cache-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './cache-dialog.component.html',
  styleUrls: ['../../system-page.css', './cache-dialog.component.css']
})
export class CacheDialogComponent implements OnInit, OnDestroy {
  readonly closed = output<void>();

  readonly servers = signal<readonly CacheServer[]>([
    { name: 'Máy chủ ứng dụng 01', done: false },
    { name: 'Máy chủ ứng dụng 02', done: false },
    { name: 'Máy chủ ứng dụng 03', done: false }
  ]);
  readonly finished = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  get doneCount(): number {
    return this.servers().filter((server) => server.done).length;
  }

  /** TODO(pre-deploy): Nhớ thay mô phỏng đồng bộ bằng kết quả thật từ API đồng bộ cache. */
  ngOnInit(): void {
    let index = 0;
    this.timer = setInterval(() => {
      index += 1;
      this.servers.update((items) => items.map((server, i) => i < index ? { ...server, done: true } : server));
      if (index >= 3) {
        this.stopTimer();
        this.finished.set(true);
      }
    }, 900);
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}