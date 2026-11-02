import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, inject, signal } from '@angular/core';
import { LucideEye, LucideEyeOff, LucideGripVertical, LucideSlidersHorizontal, LucideX } from '@lucide/angular';

export interface TableColumnOption {
  id: string;
  label: string;
  required?: boolean;
}

interface StoredColumnOption extends TableColumnOption {
  visible: boolean;
}

@Component({
  selector: 'app-column-visibility',
  standalone: true,
  imports: [LucideEye, LucideEyeOff, LucideGripVertical, LucideSlidersHorizontal, LucideX],
  templateUrl: './column-visibility.component.html',
  styleUrl: './column-visibility.component.css'
})
export class ColumnVisibilityComponent implements AfterViewInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private observer?: MutationObserver;
  private draggedId = '';
  readonly open = signal(false);
  readonly items = signal<StoredColumnOption[]>([]);
  readonly popoverPosition = signal<{ top: number; left: number; maxHeight: number } | null>(null);

  @Input({ required: true }) tableId = '';
  @Input({ required: true }) storageKey = '';
  @Input() buttonLabel = 'Tùy chỉnh cột hiển thị';
  @Input() set columns(value: ReadonlyArray<TableColumnOption>) {
    const stored = this.readStored();
    const byId = new Map(value.map(column => [column.id, column]));
    const restored = stored
      .filter(item => byId.has(item.id))
      .map(item => ({ ...byId.get(item.id)!, visible: byId.get(item.id)!.required ? true : item.visible }));
    const restoredIds = new Set(restored.map(item => item.id));
    this.items.set([...restored, ...value.filter(item => !restoredIds.has(item.id)).map(item => ({ ...item, visible: true }))]);
    setTimeout(() => this.applyToTable());
  }

  ngAfterViewInit(): void {
    this.applyToTable();
    const table = document.getElementById(this.tableId);
    if (!table) return;
    this.observer = new MutationObserver(() => this.applyToTable());
    this.observer.observe(table, { childList: true, subtree: true });
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }

  shown(): StoredColumnOption[] { return this.items().filter(item => item.visible); }
  hidden(): StoredColumnOption[] { return this.items().filter(item => !item.visible); }
  toggleOpen(): void {
    if (this.open()) { this.close(); return; }
    this.open.set(true);
    this.popoverPosition.set(null);
    setTimeout(() => this.positionPopover());
  }

  close(): void { this.open.set(false); this.popoverPosition.set(null); }

  toggle(id: string): void {
    this.items.update(items => items.map(item => item.id === id && !item.required ? { ...item, visible: !item.visible } : item));
    this.commit();
  }

  hideAll(): void {
    this.items.update(items => items.map(item => ({ ...item, visible: item.required ? true : false })));
    this.commit();
  }

  showAll(): void {
    this.items.update(items => items.map(item => ({ ...item, visible: true })));
    this.commit();
  }

  dragStart(event: DragEvent, id: string): void {
    this.draggedId = id;
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  drop(event: DragEvent, targetId: string): void {
    event.preventDefault();
    const sourceId = this.draggedId || event.dataTransfer?.getData('text/plain') || '';
    if (!sourceId || sourceId === targetId) return;
    this.items.update(items => {
      const next = [...items];
      const sourceIndex = next.findIndex(item => item.id === sourceId);
      const targetIndex = next.findIndex(item => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return items;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    this.draggedId = '';
    this.commit();
  }

  @HostListener('document:keydown.escape') closeOnEscape(): void { this.close(); }
  @HostListener('document:click', ['$event']) closeOnOutsideClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
  @HostListener('window:resize') repositionOnResize(): void { if (this.open()) this.positionPopover(); }

  private commit(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.items().map(({ id, visible }) => ({ id, visible }))));
    this.applyToTable();
  }

  private readStored(): Array<{ id: string; visible: boolean }> {
    try { return JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as Array<{ id: string; visible: boolean }>; }
    catch { return []; }
  }

  private positionPopover(): void {
    const trigger = this.host.nativeElement.querySelector('.column-visibility-trigger') as HTMLElement | null;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12, gap = 8, width = Math.min(390, window.innerWidth - margin * 2);
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const openAbove = below < 360 && above > below;
    const available = Math.max(240, openAbove ? above : below);
    const maxHeight = Math.min(560, available);
    const top = openAbove ? Math.max(margin, rect.top - gap - maxHeight) : rect.bottom + gap;
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.popoverPosition.set({ top, left, maxHeight });
  }

  private applyToTable(): void {
    const table = document.getElementById(this.tableId);
    if (!table) return;
    const order = this.items();
    table.querySelectorAll<HTMLTableRowElement>('tr').forEach(row => {
      const cells = new Map(Array.from(row.children).map(cell => [(cell as HTMLElement).dataset['column'], cell]));
      order.forEach((item, index) => {
        const cell = cells.get(item.id) as HTMLElement | undefined;
        if (!cell) return;
        cell.hidden = !item.visible;
        if (row.children[index] !== cell) row.insertBefore(cell, row.children[index] ?? null);
      });
    });
  }
}
