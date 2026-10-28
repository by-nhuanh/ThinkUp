import { Component, input } from '@angular/core';
import {
  LucideBlocks,
  LucideCodeXml,
  LucideMonitor,
  LucideShieldCheck,
  LucideSparkles,
  LucideUsers
} from '@lucide/angular';
import { RoadmapStageIcon } from '../../models/roadmap.model';

@Component({
  selector: 'app-roadmap-stage-icon',
  standalone: true,
  imports: [LucideBlocks, LucideCodeXml, LucideMonitor, LucideShieldCheck, LucideSparkles, LucideUsers],
  template: `
    @switch (icon()) {
      @case ('foundation') {
        <svg lucideMonitor aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @case ('code') {
        <svg lucideCodeXml aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @case ('framework') {
        <svg lucideBlocks aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @case ('shield') {
        <svg lucideShieldCheck aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @case ('sparkles') {
        <svg lucideSparkles aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
      }
      @default {
        <svg lucideUsers aria-hidden="true" [size]="size()" [strokeWidth]="strokeWidth()"></svg>
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
export class RoadmapStageIconComponent {
  readonly icon = input.required<RoadmapStageIcon>();
  readonly size = input(24);
  readonly strokeWidth = input(1.8);
}
