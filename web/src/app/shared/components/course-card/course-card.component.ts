import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { CourseCardView } from './course-card.model';

@Component({
  selector: 'app-course-card',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './course-card.component.html',
  styleUrl: './course-card.component.css',
})
export class CourseCardComponent {
  readonly card = input.required<CourseCardView>();
  readonly saved = input(false);

  readonly saveToggle = output<CourseCardView>();
  readonly addToCart = output<CourseCardView>();
}
