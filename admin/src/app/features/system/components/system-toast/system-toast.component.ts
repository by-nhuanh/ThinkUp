import { Component, inject } from '@angular/core';
import { SystemToastService } from '../../services/system-toast.service';

@Component({
  selector: 'app-system-toast',
  standalone: true,
  templateUrl: './system-toast.component.html',
  styleUrl: './system-toast.component.css'
})
export class SystemToastComponent {
  protected readonly toast = inject(SystemToastService);
}