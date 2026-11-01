import { Component, ElementRef, HostListener, OnDestroy, ViewChild, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideBookOpen, LucideHouse, LucideRotateCcw } from '@lucide/angular';

type GameStatus = 'idle' | 'running' | 'gameover';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, LucideBookOpen, LucideHouse, LucideRotateCcw],
  templateUrl: './not-found-reference.component.html',
  styleUrl: './not-found-reference.component.css'
})
export class NotFoundComponent implements OnDestroy {
  @ViewChild('gameTrack') private gameTrack?: ElementRef<HTMLElement>;

  readonly score = signal(404);
  readonly lives = signal(3);
  readonly status = signal<GameStatus>('idle');
  readonly dinoY = signal(0);
  readonly obstacleAssets = ['books', 'code', 'pencil', 'wifi'] as const;
  readonly obstaclePositions = signal([350, 590, 830, 1070]);

  private animationFrame: number | null = null;
  private previousTime = 0;
  private velocityY = 0;
  private scoreAccumulator = 404;
  private trackWidth = 760;
  private invulnerableUntil = 0;
  private jumpQueued = false;
  private currentSpeed = 260;
  private audioContext: AudioContext | null = null;

  private readonly initialSpeed = 260;
  private readonly maximumSpeed = 520;
  private readonly acceleration = 4;
  private readonly gravity = 2150;
  private readonly jumpVelocity = 790;
  private readonly obstacleVisibleBounds = [
    { left: 15, right: 104 },
    { left: 14, right: 78 },
    { left: 9, right: 55 },
    { left: 1, right: 75 },
  ];

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
    event.preventDefault();
    this.jump();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.hidden && this.status() === 'running') {
      this.stopAnimation();
      this.status.set('idle');
    }
  }

  jump(): void {
    if (this.status() === 'gameover') {
      this.resetGame();
    }

    if (this.status() === 'idle') {
      this.startGame();
    }

    if (this.dinoY() <= 1) {
      this.velocityY = this.jumpVelocity;
      this.jumpQueued = false;
      this.playJumpSound();
    } else {
      this.jumpQueued = true;
    }
  }

  resetGame(): void {
    this.stopAnimation();
    this.score.set(0);
    this.lives.set(3);
    this.scoreAccumulator = 0;
    this.dinoY.set(0);
    this.velocityY = 0;
    this.invulnerableUntil = 0;
    this.jumpQueued = false;
    this.currentSpeed = this.initialSpeed;
    this.measureTrack();
    this.obstaclePositions.set(this.initialObstaclePositions());
    this.status.set('idle');
  }

  ngOnDestroy(): void {
    this.stopAnimation();
    void this.audioContext?.close();
  }

  private startGame(): void {
    this.measureTrack();
    this.currentSpeed = this.initialSpeed;
    this.obstaclePositions.set([
      this.trackWidth + 320,
      this.trackWidth + 780,
      this.trackWidth + 1240,
      this.trackWidth + 1700,
    ]);
    this.status.set('running');
    this.previousTime = performance.now();
    this.animationFrame = requestAnimationFrame(time => this.tick(time));
  }

  private tick(time: number): void {
    if (this.status() !== 'running') return;

    const delta = Math.min((time - this.previousTime) / 1000, 0.034);
    this.previousTime = time;

    this.velocityY -= this.gravity * delta;
    const nextY = Math.max(0, this.dinoY() + this.velocityY * delta);
    if (nextY === 0) {
      if (this.jumpQueued) {
        this.velocityY = this.jumpVelocity;
        this.jumpQueued = false;
        this.playJumpSound();
      } else {
        this.velocityY = 0;
      }
    }
    this.dinoY.set(nextY);

    this.currentSpeed = Math.min(
      this.maximumSpeed,
      this.currentSpeed + this.acceleration * delta
    );
    const speed = this.currentSpeed;
    const currentPositions = this.obstaclePositions();
    const furthestObstacle = Math.max(...currentPositions);
    const nextPositions = currentPositions.map(position =>
      position < -140 ? furthestObstacle + this.nextObstacleGap() : position - speed * delta
    );
    this.obstaclePositions.set(nextPositions);

    this.scoreAccumulator += delta * 10;
    this.score.set(Math.floor(this.scoreAccumulator));

    const dinoLeft = Math.max(40, Math.min(96, this.trackWidth * 0.12));
    const overlapsVertically = nextY < 2;
    const hitIndex = nextPositions.findIndex((position, index) => {
      const bounds = this.obstacleVisibleBounds[index];
      return position + bounds.left < dinoLeft + 96
        && position + bounds.right > dinoLeft + 56;
    });
    if (hitIndex >= 0 && overlapsVertically && time >= this.invulnerableUntil) {
      const remainingLives = this.lives() - 1;
      this.lives.set(remainingLives);
      this.invulnerableUntil = time + 1200;
      this.playHitSound();

      if (remainingLives === 0) {
        this.finishGame();
        return;
      }

      nextPositions[hitIndex] = Math.max(...nextPositions) + this.nextObstacleGap();
      this.obstaclePositions.set([...nextPositions]);
    }

    this.animationFrame = requestAnimationFrame(nextTime => this.tick(nextTime));
  }

  private finishGame(): void {
    this.stopAnimation();
    this.status.set('gameover');
    this.playGameOverSound();
  }

  private measureTrack(): void {
    this.trackWidth = Math.max(520, this.gameTrack?.nativeElement.clientWidth ?? 760);
  }

  private initialObstaclePositions(): number[] {
    const start = Math.max(340, this.trackWidth * .43);
    return [start, start + 240, start + 480, start + 720];
  }

  private nextObstacleGap(): number {
    const speedGap = 260 + this.currentSpeed * .55;
    return Math.round(speedGap + Math.random() * 120);
  }

  private playJumpSound(): void {
    this.playTone(330, 520, .1, .045, 'square');
  }

  private playHitSound(): void {
    this.playTone(190, 72, .24, .1, 'sawtooth');
  }

  private playGameOverSound(): void {
    this.playTone(180, 65, .34, .055, 'square');
  }

  private playTone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    wave: OscillatorType
  ): void {
    const AudioContextConstructor = window.AudioContext;
    this.audioContext ??= new AudioContextConstructor();

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    const startTime = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(.001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  private stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
}
