import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-sidebar.component.html',
  styleUrl: './profile-sidebar.component.css'
})
export class ProfileSidebarComponent {
  @Input() displayName = '';
  @Input() avatarUrl = '';
  @Input() errorMessage = '';
  @Input() isUploading = false;

  @Output() fileSelected = new EventEmitter<File>();

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.fileSelected.emit(file);
    }
    // Cho phép chọn lại đúng tệp vừa bị từ chối
    input.value = '';
  }
}
