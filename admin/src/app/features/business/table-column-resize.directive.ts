import { AfterViewInit, Directive, ElementRef, HostBinding, Input, NgZone, OnDestroy, Renderer2, inject } from '@angular/core';

@Directive({ selector: 'table[appResizableColumns]', standalone: true })
export class TableColumnResizeDirective implements AfterViewInit, OnDestroy {
  private readonly tableRef = inject<ElementRef<HTMLTableElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly zone = inject(NgZone);
  private readonly cleanups: Array<() => void> = [];
  private headers: HTMLTableCellElement[] = [];
  private resizeFrame: number | null = null;

  @Input({ required: true }) appResizableColumns = '';
  @HostBinding('class.business-resizable-table') readonly resizableTableClass = true;

  ngAfterViewInit(): void {
    this.headers = Array.from(this.tableRef.nativeElement.tHead?.rows.item(0)?.cells ?? []);
    this.headers.forEach((header, index) => this.addHandle(header, index));
    this.restoreWidths();
  }

  ngOnDestroy(): void {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.cleanups.splice(0).forEach(cleanup => cleanup());
  }

  private addHandle(header: HTMLTableCellElement, index: number): void {
    if (header.hasAttribute('data-fixed-column')) return;

    const handle = this.renderer.createElement('span') as HTMLSpanElement;
    this.renderer.addClass(header, 'business-resizable-heading');
    this.renderer.addClass(handle, 'business-column-resizer');
    this.renderer.setAttribute(handle, 'role', 'separator');
    this.renderer.setAttribute(handle, 'aria-orientation', 'vertical');
    this.renderer.setAttribute(handle, 'aria-label', `Điều chỉnh độ rộng cột ${header.textContent?.trim() || index + 1}`);
    this.renderer.setAttribute(handle, 'title', 'Kéo để chỉnh độ rộng; nhấp đúp để đặt lại');
    this.renderer.setAttribute(handle, 'tabindex', '0');
    this.renderer.appendChild(header, handle);
    this.cleanups.push(
      this.renderer.listen(handle, 'pointerdown', (event: PointerEvent) => this.startResize(event, index)),
      this.renderer.listen(handle, 'dblclick', (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); this.resetWidths(); }),
      this.renderer.listen(handle, 'keydown', (event: KeyboardEvent) => this.resizeWithKeyboard(event, index))
    );
  }

  private startResize(event: PointerEvent, index: number): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.freezeCurrentWidths();
    const handle = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startWidth = this.headers[index].getBoundingClientRect().width;
    const initialWidths = this.headers.map(header => header.getBoundingClientRect().width);
    const initialTableWidth = initialWidths.reduce((total, width) => total + width, 0);
    const containerWidth = this.tableRef.nativeElement.parentElement?.clientWidth ?? 0;
    const minimum = this.headers[index].querySelector("input[type='checkbox']") ? 52 : 96;
    let pendingWidth = startWidth;
    handle.classList.add('is-resizing');
    this.tableRef.nativeElement.classList.add('is-column-resizing');
    const render = (): void => {
      this.resizeFrame = null;
      const width = Math.round(pendingWidth);
      const header = this.headers[index];
      header.style.width = `${width}px`;
      header.style.minWidth = `${width}px`;
      this.tableRef.nativeElement.style.width = `${Math.max(Math.ceil(initialTableWidth + width - startWidth), containerWidth)}px`;
    };

    this.zone.runOutsideAngular(() => {
      const move = (moveEvent: PointerEvent): void => {
        pendingWidth = Math.min(520, Math.max(minimum, startWidth + moveEvent.clientX - startX));
        if (this.resizeFrame === null) this.resizeFrame = requestAnimationFrame(render);
      };
      const stop = (): void => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
        document.removeEventListener('pointercancel', stop);
        if (this.resizeFrame !== null) {
          cancelAnimationFrame(this.resizeFrame);
          render();
        }
        handle.classList.remove('is-resizing');
        this.tableRef.nativeElement.classList.remove('is-column-resizing');
        this.persistWidths();
      };
      document.addEventListener('pointermove', move, { passive: true });
      document.addEventListener('pointerup', stop, { once: true });
      document.addEventListener('pointercancel', stop, { once: true });
    });
  }

  private resizeWithKeyboard(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.freezeCurrentWidths();
    const step = event.shiftKey ? 32 : 16;
    this.setColumnWidth(index, this.headers[index].getBoundingClientRect().width + (event.key === 'ArrowRight' ? step : -step));
    this.persistWidths();
  }

  private freezeCurrentWidths(): void {
    if (this.tableRef.nativeElement.classList.contains('has-custom-column-widths')) return;
    this.applyWidths(this.headers.map(header => Math.round(header.getBoundingClientRect().width)));
  }

  private setColumnWidth(index: number, requestedWidth: number): void {
    const minimum = this.headers[index].querySelector("input[type='checkbox']") ? 52 : 96;
    const width = Math.round(Math.min(520, Math.max(minimum, requestedWidth)));
    this.headers[index].style.width = `${width}px`;
    this.headers[index].style.minWidth = `${width}px`;
    this.updateTableWidth();
  }

  private applyWidths(widths: number[]): void {
    if (widths.length !== this.headers.length || widths.some(width => !Number.isFinite(width) || width <= 0)) return;
    this.tableRef.nativeElement.classList.add('has-custom-column-widths');
    widths.forEach((width, index) => {
      if (this.headers[index].hasAttribute('data-fixed-column')) {
        this.headers[index].style.removeProperty('width');
        this.headers[index].style.removeProperty('min-width');
        return;
      }
      this.headers[index].style.width = `${Math.round(width)}px`;
      this.headers[index].style.minWidth = `${Math.round(width)}px`;
    });
    this.updateTableWidth();
  }

  private updateTableWidth(): void {
    const width = this.headers.reduce((total, header) => total + header.getBoundingClientRect().width, 0);
    const containerWidth = this.tableRef.nativeElement.parentElement?.clientWidth ?? 0;
    this.tableRef.nativeElement.style.width = `${Math.max(Math.ceil(width), containerWidth)}px`;
  }

  private persistWidths(): void {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.headers.map(header => Math.round(header.getBoundingClientRect().width)))); }
    catch { /* Storage can be unavailable in restricted browser contexts. */ }
  }

  private restoreWidths(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) this.applyWidths(JSON.parse(stored) as number[]);
    } catch {
      try { localStorage.removeItem(this.storageKey); } catch { /* Storage is unavailable. */ }
    }
  }

  private resetWidths(): void {
    this.headers.forEach(header => { header.style.removeProperty('width'); header.style.removeProperty('min-width'); });
    const table = this.tableRef.nativeElement;
    table.style.removeProperty('width');
    table.classList.remove('has-custom-column-widths');
    try { localStorage.removeItem(this.storageKey); } catch { /* The visual reset still works. */ }
  }

  private get storageKey(): string { return `thinkup-admin:table-columns:${this.appResizableColumns}`; }
}
