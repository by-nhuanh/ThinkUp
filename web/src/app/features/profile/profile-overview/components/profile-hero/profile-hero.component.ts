import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserProfile } from '../../../../../core/models/profile.model';

@Component({
  selector: 'app-profile-hero',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile-hero.component.html',
  styleUrl: './profile-hero.component.css'
})
export class ProfileHeroComponent {
  @Input({ required: true }) profile!: UserProfile;
}
