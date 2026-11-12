import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CanvasItemKind, canvasTextFields, webLink } from '../add-to-canvas-menu/add-to-canvas-menu.component';
import { LucideEraser, LucideGripHorizontal, LucidePencil, LucideImage, LucideLink, LucidePalette, LucideTrash2 } from '@lucide/angular';

interface BoardStroke {
  points: string;
  color: string;
}

export interface CanvasItem { id: string; kind: CanvasItemKind; content: string; x: number; y: number; width: number; height: number; z?: number; ownerId?: string; checkedRows?: number[]; color?: string; url?: string; label?: string; strokes?: (BoardStroke | string)[]; }

@Component({ selector: 'app-canvas-item', standalone: true, imports: [LucideEraser, LucideGripHorizontal, LucidePencil, LucideImage, LucideLink, LucidePalette, LucideTrash2], templateUrl: './canvas-item.component.html', styleUrl: './canvas-item.component.css' })
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
  readonly penPaletteOpen = signal(false);
  readonly penColors = [
    { label: 'Đen', value: '#000000' },
    { label: 'Đỏ', value: '#dc2626' },
    { label: 'Xanh dương', value: '#2563eb' },
    { label: 'Xanh lá', value: '#15803d' },
    { label: 'Tím', value: '#7e22ce' },
  ];
  readonly penColor = signal(this.penColors[0].value);
  readonly activeStroke = signal<BoardStroke | null>(null);
  private strokePointer: number | null = null;
  readonly paletteOpen = signal(false);
  readonly urlInput = signal('');
  readonly urlError = signal('');
  readonly colors = ['#fff4a8', '#ffd6e8', '#d2f5df', '#d8eaff', '#e8dcff'];
  private readonly sanitizer = inject(DomSanitizer);
  private points: string[] = [];
  private pendingChange: Partial<CanvasItem> | null = null;
  private gesture: { mode: 'move' | 'resize'; clientX: number; clientY: number; x: number; y: number; width: number; height: number } | null = null;
  readonly textFields = canvasTextFields;
  readonly draft = signal('');
  readonly linkHref = computed(() => webLink(this.item().content));
  readonly webLink = webLink;
  readonly tasks = computed(() => this.item().content.split(/\r?\n/).map(row => row.trim()).filter(Boolean));

  toggleTask(index: number): void {
    if (!this.canManage()) return;
    const checked = this.item().checkedRows ?? [];
    this.commit({ checkedRows: checked.includes(index) ? checked.filter(row => row !== index) : [...checked, index] });
  }
  private readonly injector = inject(Injector);
  private readonly editor = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('textEditor');
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');

  startTextEdit(): void {
    if (!this.canManage()) return;
    this.draft.set(this.item().content);
    this.activate.emit();
    this.editing.set(true);
    afterNextRender(() => this.editor()?.nativeElement.focus(), { injector: this.injector });
  }

  finishTextEdit(save: boolean): void {
    const kind = this.item().kind;
    if (kind !== 'text' && kind !== 'note' && kind !== 'checklist' && kind !== 'link') return;
    const content = this.draft().trim();
    if (save && (!this.canManage() || !content || content.length > this.textFields[kind].limit || (kind === 'link' && !webLink(content)))) return;
    if (save && content !== this.item().content) this.commit(kind === 'checklist'
      ? { content, checkedRows: [] }
      : { content });
    this.editing.set(false);
    afterNextRender(() => this.editButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }
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
    if (target.closest('button,input,textarea,iframe,a,label,.editable-copy,.mini-toolbar,.resize-handle,.draw-surface,.board-tools')) return;
    this.startGesture(event, 'move');
  }
  startGesture(event:PointerEvent,mode:'move'|'resize'):void {
    if (!this.canManage() || event.button !== 0 || !event.isPrimary || this.strokePointer !== null || (mode === 'move' && this.movementLocked())) return;
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
      const kind = this.item().kind;
      const minimum = kind === 'youtube' ? { width: 320, height: 200 }
        : kind === 'whiteboard' ? { width: 240, height: 144 }
        : { width: 140, height: 100 };
      this.preview({width:Math.max(minimum.width,this.gesture.width+dx),height:Math.max(minimum.height,this.gesture.height+dy)});
    }
  }
  endGesture():void {if(!this.gesture)return;this.gesture=null;this.commitPending();}
  canResize(): boolean { return ['image', 'gif', 'youtube', 'whiteboard'].includes(this.item().kind); }
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
  selectPen(color: string): void {
    this.penColor.set(color);
    this.closePenPalette();
  }

  closePenPalette(): void {
    this.penPaletteOpen.set(false);
    this.penButton()?.nativeElement.focus({ preventScroll: true });
  }

  private readonly penButton = viewChild<ElementRef<HTMLButtonElement>>('penButton');

  startStroke(event: PointerEvent): void {
    if (!this.canManage() || event.button !== 0 || !event.isPrimary || this.gesture || this.strokePointer !== null) return;
    event.preventDefault();
    event.stopPropagation();
    const surface = event.currentTarget as SVGElement;
    this.activate.emit();
    this.penPaletteOpen.set(false);
    surface.setPointerCapture(event.pointerId);
    this.strokePointer = event.pointerId;
    const point = this.point(event);
    this.points = [point];
    this.activeStroke.set({ points: point + ' ' + point, color: this.penColor() });
  }

  moveStroke(event: PointerEvent): void {
    const stroke = this.activeStroke();
    if (event.pointerId !== this.strokePointer || !stroke) return;
    const point = this.point(event);
    if (point === this.points.at(-1)) return;
    this.points.push(point);
    this.activeStroke.set({ ...stroke, points: this.points.join(' ') });
  }

  endStroke(event: PointerEvent): void {
    if (event.pointerId !== this.strokePointer) return;
    const stroke = this.activeStroke();
    this.strokePointer = null;
    this.points = [];
    this.activeStroke.set(null);
    if (stroke && event.type === 'pointerup' && this.canManage()) {
      this.commit({ strokes: [...(this.item().strokes ?? []), stroke] });
    }
  }
  commit(change: Partial<CanvasItem>): void { this.pendingChange = null; this.itemCommit.emit(change); }
  private preview(change: Partial<CanvasItem>): void { this.pendingChange = { ...(this.pendingChange || {}), ...change }; this.itemChange.emit(change); }
  private commitPending(): void { if (!this.pendingChange) return; const change = this.pendingChange; this.pendingChange = null; this.itemCommit.emit(change); }
  private point(event: PointerEvent): string { const rect = (event.currentTarget as Element).getBoundingClientRect(); return `${((event.clientX - rect.left) / rect.width * 100).toFixed(2)},${((event.clientY - rect.top) / rect.height * 100).toFixed(2)}`; }
}
