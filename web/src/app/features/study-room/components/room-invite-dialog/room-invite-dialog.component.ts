import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { LucideCopy, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-room-invite-dialog',
  standalone: true,
  imports: [LucideCopy, LucideX],
  templateUrl: './room-invite-dialog.component.html',
  styleUrls: ['../room-glass.css', './room-invite-dialog.component.css'],
})
export class RoomInviteDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly link = input.required<string>();
  readonly theme = input.required<string>();
  readonly dark = input(false);
  readonly feedback = input('');
  readonly copyLink = output<void>();
  readonly close = output<void>();

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  dismiss(): void {
    this.dialog().nativeElement.close();
    this.close.emit();
  }
}
