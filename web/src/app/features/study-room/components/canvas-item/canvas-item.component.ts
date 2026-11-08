import { Component, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CanvasItemKind } from '../add-to-canvas-menu/add-to-canvas-menu.component';
import { LucideEraser, LucideImage, LucideLink, LucidePalette, LucideTrash2 } from '@lucide/angular';

export interface CanvasItem { id: string; kind: CanvasItemKind; content: string; x: number; y: number; width: number; height: number; z?: number; ownerId?: string; color?: string; url?: string; label?: string; strokes?: string[]; }

@Component({ selector: 'app-canvas-item', standalone: true, imports: [LucideEraser, LucideImage, LucideLink, LucidePalette, LucideTrash2], templateUrl: './canvas-item.component.html', styleUrl: './canvas-item.component.css' })
export class CanvasItemComponent {
  readonly item = input.required<CanvasItem>();
  readonly scale = input(1);
  readonly canManage = input(true);
  readonly selected = input(false);
  readonly movementLocked = input(false);
  readonly itemChange = output<Partial<CanvasItem>>();
  readonly itemCommit = output<Partial<CanvasItem>>();
  readonly activate = output<void>();
  readonly remove = output<void>();
  readonly editing = signal(false);
  readonly drawing = signal(false);
  readonly drawMode = signal(false);
  readonly paletteOpen = signal(false);
  readonly urlInput = signal('');
  readonly urlError = signal('');
  readonly colors = ['#fff4a8', '#ffd6e8', '#d2f5df', '#d8eaff', '#e8dcff'];
  private readonly sanitizer = inject(DomSanitizer);
  private points: string[] = [];
  private priorStrokes: string[] = [];
  private pendingChange: Partial<CanvasItem> | null = null;
  private gesture: { mode: 'move' | 'resize'; clientX: number; clientY: number; x: number; y: number; width: number; height: number } | null = null;
  onInput(event: Event): void { this.preview({ content: (event.target as HTMLTextAreaElement).value }); }
  finishEditing(): void { this.editing.set(false); this.commitPending(); }
  saveUrl(): void {
    if (!this.canManage()) return;
    const raw = this.urlInput().trim();
    try {
      const url = new URL(raw);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Đường dẫn phải bắt đầu bằng http hoặc https.');
      if (this.item().kind === 'youtube') {
        if (!/(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(url.hostname)) {
          throw new Error('Vui lòng nhập link YouTube hợp lệ.');
        }
        if (!this.youtubeId(raw)) throw new Error('Link YouTube không hợp lệ.');
      }
      this.urlError.set(''); this.commit({ url: raw }); this.editing.set(false);
    } catch {
      this.urlError.set('Vui lòng nhập đường dẫn hợp lệ.');
    }
  }
  editUrl():void {if(!this.canManage())return;this.urlInput.set(this.item().url || '');this.urlError.set('');this.editing.set(true);}
  startMove(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button,input,textarea,iframe,.mini-toolbar,.resize-handle') || (this.item().kind === 'whiteboard' && this.drawMode())) return;
    this.startGesture(event, 'move');
  }
  startGesture(event:PointerEvent,mode:'move'|'resize'):void {
    if(!this.canManage() || (mode === 'move' && this.movementLocked()))return;
    event.preventDefault();event.stopPropagation();this.activate.emit();
    const item=this.item();
    this.pendingChange=null;
    this.gesture={mode,clientX:event.clientX,clientY:event.clientY,x:item.x,y:item.y,width:item.width,height:item.height};
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  moveGesture(event:PointerEvent):void {
    if(!this.gesture)return;
    const dx=(event.clientX-this.gesture.clientX)/this.scale(),dy=(event.clientY-this.gesture.clientY)/this.scale();
    if(this.gesture.mode==='move')this.preview({x:this.gesture.x+dx,y:this.gesture.y+dy});
    else {
      const minimum = this.item().kind === 'youtube' ? { width: 320, height: 200 } : { width: 140, height: 100 };
      this.preview({width:Math.max(minimum.width,this.gesture.width+dx),height:Math.max(minimum.height,this.gesture.height+dy)});
    }
  }
  endGesture():void {if(!this.gesture)return;this.gesture=null;this.commitPending();}
  canResize(): boolean { return ['image', 'gif', 'youtube'].includes(this.item().kind); }
  embedUrl(): SafeResourceUrl | null {
    const id = this.youtubeId(this.item().url || '');
    return id
      ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${id}?autoplay=0&rel=0`)
      : null;
  }

  /** Nhận cả link watch, youtu.be, Shorts, Live, embed và /v/. */
  private youtubeId(rawUrl: string): string | null {
    const url = rawUrl.trim();
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)([\w-]{11})/,
      /youtu\.be\/([\w-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }
  startStroke(event: PointerEvent): void { if (!this.canManage() || !this.drawMode()) return; this.drawing.set(true); this.pendingChange = null; this.priorStrokes = this.item().strokes || []; this.points = [this.point(event)]; this.preview({ strokes: [...this.priorStrokes, this.points.join(' ')] }); (event.target as Element).setPointerCapture(event.pointerId); }
  moveStroke(event: PointerEvent): void { if (!this.drawing()) return; this.points.push(this.point(event)); this.preview({ strokes: [...this.priorStrokes, this.points.join(' ')] }); }
  endStroke(): void { if (!this.drawing()) return; this.drawing.set(false); this.points = []; this.commitPending(); }
  commit(change: Partial<CanvasItem>): void { this.pendingChange = null; this.itemCommit.emit(change); }
  private preview(change: Partial<CanvasItem>): void { this.pendingChange = { ...(this.pendingChange || {}), ...change }; this.itemChange.emit(change); }
  private commitPending(): void { if (!this.pendingChange) return; const change = this.pendingChange; this.pendingChange = null; this.itemCommit.emit(change); }
  private point(event: PointerEvent): string { const rect = (event.currentTarget as Element).getBoundingClientRect(); return `${((event.clientX - rect.left) / rect.width * 100).toFixed(2)},${((event.clientY - rect.top) / rect.height * 100).toFixed(2)}`; }
}
