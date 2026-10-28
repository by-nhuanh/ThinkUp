import { Component, input } from '@angular/core';
import { LucideAtom, LucideBinary, LucideCode, LucideDatabase } from '@lucide/angular';

@Component({
  selector: 'app-flashcard-set-icon',
  standalone: true,
  imports: [LucideAtom, LucideBinary, LucideCode, LucideDatabase],
  template: `
    @switch (icon()) {
      @case ('database') {
        <svg lucideDatabase aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @case ('atom') {
        <svg lucideAtom aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @case ('algorithm') {
        <svg lucideBinary aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @default {
        <svg lucideCode aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    `
  ]
})
export class FlashcardSetIconComponent {
  readonly icon = input('code');
  readonly size = input(24);
  readonly strokeWidth = input(1.8);
}
