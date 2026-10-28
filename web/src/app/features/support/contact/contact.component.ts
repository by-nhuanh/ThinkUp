import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { AuthService } from '../../../core/services/auth.service';
import { FAQ_CATEGORIES, SUPPORT_TOPICS } from '../data/support.data';

interface Attachment { file: File; size: string; }

@Component({ selector: 'app-contact-view', standalone: true, imports: [CommonModule, ReactiveFormsModule, RouterLink], templateUrl: './contact.component.html', styleUrl: './contact.component.css' })
export class ContactComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  readonly topics = SUPPORT_TOPICS;
  readonly categories = FAQ_CATEGORIES.slice(1, 5);
  readonly attachments = signal<Attachment[]>([]);
  readonly fileError = signal('');
  readonly submitted = signal(false);
  readonly ticketId = signal('');
  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    topic: ['', Validators.required],
    message: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(1000)]],
  });

  ngOnInit(): void {
    this.title.setTitle('Liên Hệ Hỗ Trợ & Chăm Sóc Học Viên | ThinkUp');
    this.meta.updateTag({ name: 'description', content: 'Trung tâm hỗ trợ học viên ThinkUp. Giải đáp thắc mắc về khóa học, thanh toán, tài khoản và hỗ trợ kỹ thuật trong vòng 24 giờ. Hotline: 0234 000 864.' });
    const user = this.auth.currentUser();
    if (user) this.form.patchValue({ fullName: user.full_name, email: user.email });
    const category = this.route.snapshot.queryParamMap.get('category');
    const topicByCategory: Record<string, string> = { payment: this.topics[1], learning: this.topics[4], certificate: this.topics[4], account: this.topics[3], technical: this.topics[2], policy: this.topics[5], other: this.topics[5] };
    if (category && topicByCategory[category]) this.form.patchValue({ topic: topicByCategory[category] });
  }

  fieldInvalid(name: 'fullName' | 'email' | 'topic' | 'message'): boolean { const field = this.form.controls[name]; return field.invalid && (field.touched || field.dirty); }
  addFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.fileError.set('');
    for (const file of files) {
      if (this.attachments().length >= 3) { this.fileError.set('Bạn chỉ có thể đính kèm tối đa 3 tệp.'); break; }
      if (file.size > 5 * 1024 * 1024) { this.fileError.set('Tệp vượt quá dung lượng tối đa 5MB. Vui lòng chọn tệp nhỏ hơn.'); continue; }
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !['jpg', 'jpeg', 'png', 'pdf', 'docx'].includes(extension)) { this.fileError.set('Định dạng tệp không được hỗ trợ. Chỉ chấp nhận JPG, PNG, PDF, DOCX.'); continue; }
      this.attachments.update(items => [...items, { file, size: `${(file.size / 1024 / 1024).toFixed(1)} MB` }]);
    }
    input.value = '';
  }
  removeFile(index: number): void { this.attachments.update(items => items.filter((_, itemIndex) => itemIndex !== index)); }
  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    // TODO(pre-deploy): Nhớ thay trạng thái thành công cục bộ bằng API tạo ticket từ backend handoff.
    this.ticketId.set(`#TK-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`);
    this.submitted.set(true);
  }
}
