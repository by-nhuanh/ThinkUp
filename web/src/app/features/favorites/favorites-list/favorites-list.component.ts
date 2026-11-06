import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../../core/services/favorites.service';
import { Course } from '../../../core/models/course.model';
import { Subscription } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { CourseCardComponent } from '../../courses/components/course-card/course-card.component';

@Component({
  selector: 'app-favorites-list',
  standalone: true,
  imports: [CommonModule, RouterLink, CourseCardComponent],
  templateUrl: './favorites-list.component.html',
  styleUrl: './favorites-list.component.css',
})
export class FavoritesListComponent implements OnInit {
  private favoritesService = inject(FavoritesService);
  private readonly toast = inject(ToastService);
  private request?: Subscription;

  isReady = signal(false);
  sort = signal('recent');
  isSortOpen = signal(false);

  readonly courses = this.favoritesService.favorites;
  readonly sortOptions = [
    { value: 'recent', label: 'Mới thêm gần đây' },
    { value: 'rating', label: 'Đánh giá cao nhất' },
    { value: 'price-low', label: 'Giá thấp đến cao' },
    { value: 'price-high', label: 'Giá cao đến thấp' },
  ];

  readonly sortedCourses = computed(() => {
    const result = [...this.courses()];
    const s = this.sort();
    if (s === 'rating') result.sort((a, b) => b.rating - a.rating);
    if (s === 'price-low') result.sort((a, b) => a.salePrice - b.salePrice);
    if (s === 'price-high') result.sort((a, b) => b.salePrice - a.salePrice);
    return result;
  });

  readonly activeSortLabel = computed(() =>
    this.sortOptions.find(o => o.value === this.sort())?.label || 'Mới thêm gần đây'
  );

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.request?.unsubscribe();
    const sort = ({ recent: 'newest', rating: 'highest_rated', 'price-low': 'price_asc', 'price-high': 'price_desc' } as Record<string, string>)[this.sort()];
    this.request = this.favoritesService.loadFavorites({ sort, limit: 'all' }).subscribe({
      next: () => this.isReady.set(true),
      error: () => {
        this.isReady.set(true);
        this.toast.showToast({ type: 'warning', message: 'Không tải được danh sách yêu thích.' });
      },
    });
  }

  selectSort(value: string): void {
    this.sort.set(value);
    this.isSortOpen.set(false);
    this.reload();
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); }
}
