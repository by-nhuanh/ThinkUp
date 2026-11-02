import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideBookmark, LucideShoppingCart, LucideStar, LucideUserRound } from '@lucide/angular';
import { Course } from '../../../../core/models/course.model';
import { ToastService } from '../../../../core/services/toast.service';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { InstructorTriggerDirective } from '../../../../shared/directives/instructor-trigger.directive';

@Component({
  selector: 'app-roadmap-course-card',
  standalone: true,
  imports: [RouterLink, LucideBookmark, LucideShoppingCart, LucideStar, LucideUserRound, InstructorTriggerDirective],
  templateUrl: './roadmap-course-card.component.html',
  styleUrls: ['../../styles/roadmap-ui.css', './roadmap-course-card.component.css']
})
export class RoadmapCourseCardComponent {
  private readonly favoritesService = inject(FavoritesService);
  private readonly toastService = inject(ToastService);

  readonly course = input.required<Course>();
  readonly addToCart = output<string>();

  readonly coverTitle = computed(() => this.course().title.split(' - ')[0]);
  readonly isFavorite = computed(() => this.favoritesService.isFavorite(this.course().id));
  readonly badge = computed(() => this.course().badge ?? 'HOT');
  readonly tags = computed(() => (this.course().tags ?? []).slice(0, 3));

  formatPrice(value: number): string {
    return `${value.toLocaleString('vi-VN')}đ`;
  }

  toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.favoritesService.toggleFavorite(this.course()).subscribe((result) => {
      this.toastService.showToast({
        type: 'success',
        message: result.isFavorite ? 'Đã thêm khóa học vào yêu thích.' : 'Đã bỏ khóa học khỏi yêu thích.'
      });
    });
  }

  onAddToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.addToCart.emit(this.course().id);
  }
}
