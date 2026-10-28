import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileService } from '../services/profile.service';
import { ProfileHeroComponent } from './components/profile-hero/profile-hero.component';
import { CurrentCoursesCardComponent } from './components/current-courses-card/current-courses-card.component';
import { RecentActivityCardComponent } from './components/recent-activity-card/recent-activity-card.component';
import { CertificatesCardComponent } from './components/certificates-card/certificates-card.component';

@Component({
  selector: 'app-profile-overview',
  standalone: true,
  imports: [
    CommonModule,
    ProfileHeroComponent,
    CurrentCoursesCardComponent,
    RecentActivityCardComponent,
    CertificatesCardComponent,
  ],
  templateUrl: './profile-overview.component.html',
  styleUrl: './profile-overview.component.css'
})
export class ProfileOverviewComponent implements OnInit {
  readonly profileService = inject(ProfileService);

  ngOnInit(): void {
    this.profileService.getProfileOverview().subscribe();
  }
}
