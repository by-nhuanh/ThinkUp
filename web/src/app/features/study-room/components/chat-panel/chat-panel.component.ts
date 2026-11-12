import { Component, ElementRef, afterNextRender, afterRenderEffect, input, model, output, viewChild } from '@angular/core';
import { LucideMessageCircle, LucidePlus, LucideSendHorizontal, LucideSmile, LucideX } from '@lucide/angular';

export interface RoomChatMessage { id: string; senderId: string; sender: string; text: string; time: string; initials: string; color: string; isMe?: boolean; }

@Component({ selector: 'app-chat-panel', standalone: true, imports: [LucideMessageCircle, LucidePlus, LucideSendHorizontal, LucideSmile, LucideX], templateUrl: './chat-panel.component.html', styleUrls: ['../room-glass.css', './chat-panel.component.css'] })
export class ChatPanelComponent {
  readonly position = model<{ x: number; y: number } | null>(null);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('chatPanel');
  private drag: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  readonly messagesHost = viewChild<ElementRef<HTMLDivElement>>('messagesHost');
  readonly draftInput = viewChild<ElementRef<HTMLTextAreaElement>>('draftInput');
  readonly messages = input.required<readonly RoomChatMessage[]>();
  readonly roomName = input.required<string>();
  readonly memberCount = input.required<number>();
  readonly close = output<void>();
  readonly send = output<string>();
  readonly addImage = output<void>();
  readonly canAddImage = input(false);
  readonly emojis = ['😀', '😂', '👍', '❤️', '🎉', '🔥', '👀', '🙌'];
  readonly draft = model('');
  readonly sending = input(false);
  readonly theme = input('');
  readonly dark = input(false);
  constructor() {
    afterNextRender(() => {
      this.draftInput()?.nativeElement.focus();
    });
    afterRenderEffect(() => {
      this.messages();
      this.scrollToLatest();
    });
  }
  startDrag(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest('button')) return;
    const bounds = this.panel().nativeElement.getBoundingClientRect();
    this.drag = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  moveDrag(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.position.set({ x: event.clientX - this.drag.offsetX, y: event.clientY - this.drag.offsetY });
  }

  endDrag(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = null;
    this.saveVisiblePosition();
  }

  moveWithKeyboard(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    const step = 16;
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault();
    const panel = this.panel().nativeElement;
    const bounds = panel.getBoundingClientRect();
    const x = Math.max(8, Math.min(innerWidth - bounds.width - 8, bounds.left + delta[0]));
    const y = Math.max(8, Math.min(innerHeight - bounds.height - 8, bounds.top + delta[1]));
    this.position.set({ x, y });
  }

  private saveVisiblePosition(): void {
    if (!this.position()) return;
    const bounds = this.panel().nativeElement.getBoundingClientRect();
    this.position.set({ x: bounds.left, y: bounds.top });
  }

  onInput(event: Event): void { this.draft.set((event.target as HTMLTextAreaElement).value); }
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.submit(); }
  }
  closeEmojiOnBlur(event: FocusEvent, picker: HTMLDetailsElement): void {
    if (!(event.relatedTarget instanceof Node) || !picker.contains(event.relatedTarget)) picker.open = false;
  }

  insertEmoji(emoji: string, picker: HTMLDetailsElement): void {
    const input = this.draftInput()?.nativeElement;
    if (!input) return;
    const start = input.selectionStart;
    input.setRangeText(emoji, start, input.selectionEnd, 'end');
    this.draft.set(input.value);
    picker.open = false;
    input.focus();
  }

  submit(): void {
    const text = this.draft().trim();
    if (text && !this.sending()) this.send.emit(text);
  }
  private scrollToLatest(): void {
    const host = this.messagesHost()?.nativeElement;
    if (host) host.scrollTo({ top: host.scrollHeight, behavior: 'instant' });
  }
}
