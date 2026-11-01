import { Component, computed, input, output } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';

type PaginationItem = { kind: 'page'; value: number } | { kind: 'ellipsis' };

@Component({
  selector: 'app-support-pagination',
  standalone: true,
  imports: [LucideChevronLeft, LucideChevronRight],
  templateUrl: './support-pagination.component.html',
  styleUrl: './support-pagination.component.css'
})
export class SupportPaginationComponent {
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly totalItems = input.required<number>();
  readonly itemLabel = input('bản ghi');
  readonly pageChange = output<number>();

  readonly start = computed(() => this.totalItems() ? (this.page() - 1) * this.pageSize() + 1 : 0);
  readonly end = computed(() => Math.min(this.page() * this.pageSize(), this.totalItems()));
  readonly items = computed<PaginationItem[]>(() => {
    const total = Math.max(1, this.pages());
    const current = Math.min(Math.max(this.page(), 1), total);
    const pageItem = (value: number): PaginationItem => ({ kind: 'page', value });
    const ellipsis: PaginationItem = { kind: 'ellipsis' };
    if (total <= 5) return Array.from({ length: total }, (_, index) => pageItem(index + 1));
    if (current <= 3) return [pageItem(1), pageItem(2), pageItem(3), ellipsis, pageItem(total)];
    if (current >= total - 2) return [pageItem(1), ellipsis, pageItem(total - 2), pageItem(total - 1), pageItem(total)];
    return [pageItem(1), ellipsis, pageItem(current), ellipsis, pageItem(total)];
  });

  goTo(value: number): void {
    const next = Math.max(1, Math.min(this.pages(), value));
    if (next !== this.page()) this.pageChange.emit(next);
  }
}
