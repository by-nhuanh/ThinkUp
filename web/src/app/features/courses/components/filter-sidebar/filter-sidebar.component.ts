import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseFilters } from '../../../../core/models/course.model';

@Component({
  selector: 'app-filter-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-sidebar.component.html',
  styleUrl: './filter-sidebar.component.css'
})
export class FilterSidebarComponent {
  @Input() filters: CourseFilters = {};
  @Input() categories: string[] = [];
  @Output() filterChange = new EventEmitter<CourseFilters>();
  @Output() clearFilters = new EventEmitter<void>();

  readonly visibleCategoryLimit = 7;
  readonly showAllCategories = signal(false);

  readonly levels = ['Cơ bản', 'Trung cấp', 'Nâng cao'];
  readonly ratings = [
    { id: '', label: 'Tất cả' },
    { id: '4.5', label: 'Từ 4.5 sao trở lên' },
    { id: '4.0', label: 'Từ 4 sao trở lên' },
    { id: '3.5', label: 'Từ 3.5 sao trở lên' },
    { id: '3.0', label: 'Từ 3 sao trở lên' },
  ];
  readonly priceTypes = [
    { id: 'all', label: 'Tất cả' },
    { id: 'paid', label: 'Có trả phí' },
    { id: 'free', label: 'Miễn phí' },
  ];

  getVisibleCategories(): string[] {
    return this.showAllCategories() ? this.categories : this.categories.slice(0, this.visibleCategoryLimit);
  }

  toggleCategory(cat: string): void {
    const current = this.filters.categories || [];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    this.filterChange.emit({ ...this.filters, categories: next });
  }

  setLevel(level: string): void {
    const next = this.filters.levels?.includes(level) ? [] : [level];
    this.filterChange.emit({ ...this.filters, levels: next });
  }

  setRating(ratingId: string): void {
    this.filterChange.emit({ ...this.filters, ratings: ratingId });
  }

  maxDuration(): number {
    return this.filters.maxDuration || 120;
  }

  durationPercent(): number {
    return Math.min(100, Math.max(0, (this.maxDuration() / 120) * 100));
  }

  getDurationTrackBackground(): string {
    const percent = this.durationPercent();
    return `linear-gradient(to right, #2B7FFF 0%, #2B7FFF ${percent}%, #E2E8F0 ${percent}%, #E2E8F0 100%)`;
  }

  setDuration(duration: string): void {
    this.filterChange.emit({ ...this.filters, maxDuration: parseInt(duration, 10) });
  }

  setPriceType(pt: string): void {
    this.filterChange.emit({ ...this.filters, priceType: pt });
  }
}
