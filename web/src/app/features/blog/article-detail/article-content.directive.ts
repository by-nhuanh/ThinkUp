import { AfterViewInit, Directive, ElementRef, inject, input, OnDestroy } from '@angular/core';

const COPY_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';

export interface ArticleHeading {
  id: string;
  text: string;
  level: number;
}

/**
 * Progressive enhancement for sanitised article HTML rendered through [innerHTML].
 * Angular cannot bind events inside injected markup, so code-copy controls and the
 * horizontal scroll wrapper for tables are added after each render.
 *
 * Angular's HTML sanitiser drops `id` attributes from injected markup, so the ids
 * used by the table of contents are restored here from the already-computed headings.
 */
@Directive({ selector: '[appArticleContent]', standalone: true })
export class ArticleContentDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly headings = input<readonly ArticleHeading[]>([]);
  private observer: MutationObserver | null = null;
  private frame = 0;

  ngAfterViewInit(): void {
    this.enhance();
    if (typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this.host.nativeElement, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.enhance();
    });
  }

  private enhance(): void {
    const root = this.host.nativeElement;
    const headings = this.headings();
    root.querySelectorAll('h2, h3').forEach((node, index) => {
      const id = headings[index]?.id;
      if (id && node.id !== id) node.id = id;
    });
    root.querySelectorAll('pre').forEach((pre) => this.addCopyButton(pre));
    root.querySelectorAll('table').forEach((table) => this.wrapTable(table));
  }

  private addCopyButton(pre: Element): void {
    if (pre.querySelector(':scope > .article-code-copy')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'article-code-copy';
    button.setAttribute('aria-label', 'Sao chép đoạn mã');
    button.title = 'Sao chép đoạn mã';
    button.innerHTML = COPY_ICON;
    button.addEventListener('click', () => {
      if (!navigator.clipboard) return;
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      navigator.clipboard
        .writeText(code)
        .then(() => {
          button.classList.add('is-copied');
          button.setAttribute('aria-label', 'Đã sao chép đoạn mã');
          window.setTimeout(() => {
            if (!button.isConnected) return;
            button.classList.remove('is-copied');
            button.setAttribute('aria-label', 'Sao chép đoạn mã');
          }, 1800);
        })
        .catch(() => undefined);
    });
    pre.appendChild(button);
  }

  private wrapTable(table: Element): void {
    if (table.parentElement?.classList.contains('article-table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'article-table-wrap';
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  }
}
