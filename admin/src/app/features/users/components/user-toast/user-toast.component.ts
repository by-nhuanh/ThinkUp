import { Component, inject } from '@angular/core';
import { UserToastService } from '../../services/user-toast.service';

/** Hiển thị thông báo của `UserToastService`; mỗi trang trong module render đúng một lần. */
@Component({
  selector: 'app-user-toast',
  standalone: true,
  templateUrl: './user-toast.component.html',
  styleUrl: './user-toast.component.css'
})
export class UserToastComponent {
  protected readonly toast = inject(UserToastService);
}
