import { afterNextRender, Component, ElementRef, inject, Injector, output, signal, viewChild, viewChildren } from '@angular/core';

export type CanvasItemKind = 'text' | 'note' | 'image' | 'gif' | 'youtube' | 'whiteboard' | 'checklist' | 'link';
export type CanvasTextKind = 'text' | 'note' | 'checklist' | 'link';
export const canvasTextFields = {
  text: { label: 'Tiêu đề', limit: 120 },
  checklist: { label: 'Danh sách việc', limit: 1000 },
  link: { label: 'Liên kết', limit: 2048 },
  note: { label: 'Ghi chú', limit: 1000 },
} as const;
export type NewCanvasItemKind = Exclude<CanvasItemKind, 'gif' | 'text'>;

export function webLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-add-to-canvas-menu',
  standalone: true,
  templateUrl: './add-to-canvas-menu.component.html',
  styleUrl: './add-to-canvas-menu.component.css'
})
export class AddToCanvasMenuComponent {
  readonly addItem = output<Exclude<NewCanvasItemKind, CanvasTextKind>>();
  readonly addText = output<{ kind: CanvasTextKind; content: string }>();
  readonly textKind = signal<CanvasTextKind | null>(null);
  readonly draft = signal('');
  readonly webLink = webLink;
  readonly textFields = canvasTextFields;
  private readonly injector = inject(Injector);
  private readonly editor = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('editor');
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('option');
  private lastTrigger?: HTMLElement;
  readonly close = output<void>();
  readonly items: { key: NewCanvasItemKind; label: string; desc: string }[] = [
    { key: 'note', label: 'Ghi chú', desc: 'Ý tưởng nhanh' },
    { key: 'image', label: 'Ảnh', desc: 'PNG / JPG' },
    { key: 'youtube', label: 'YouTube', desc: 'Video nhúng' },
    { key: 'whiteboard', label: 'Bảng', desc: 'Vẽ tự do' },
    { key: 'checklist', label: 'Danh sách việc', desc: 'Đánh dấu hoàn thành' },
    { key: 'link', label: 'Liên kết', desc: 'Tài liệu tham khảo' },
  ];
  select(kind: NewCanvasItemKind, trigger: HTMLElement): void {
    if (kind === 'note' || kind === 'checklist' || kind === 'link') {
      this.lastTrigger = trigger;
      this.draft.set('');
      this.textKind.set(kind);
      afterNextRender(() => this.editor()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    this.addItem.emit(kind);
    this.close.emit();
  }

  back(): void {
    this.textKind.set(null);
    afterNextRender(() => {
      const key = this.lastTrigger?.dataset['kind'];
      this.options().find(option => option.nativeElement.dataset['kind'] === key)?.nativeElement.focus();
    }, { injector: this.injector });
  }

  submit(kind: CanvasTextKind): void {
    const content = this.draft().trim();
    if (!content || content.length > this.textFields[kind].limit || (kind === 'link' && !webLink(content))) return;
    this.addText.emit({ kind, content });
    this.close.emit();
  }
}
