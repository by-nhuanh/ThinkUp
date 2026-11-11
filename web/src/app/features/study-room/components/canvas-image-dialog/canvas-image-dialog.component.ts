import { LucideCloudUpload, LucideImage, LucideImagePlus, LucideLink, LucideX } from '@lucide/angular';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { StudyRoomExtras } from '../../services/study-room-extras';

export interface CanvasImageSource {
  url: string;
  width: number;
  height: number;
}

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

@Component({
  selector: 'app-canvas-image-dialog',
  standalone: true,
  templateUrl: './canvas-image-dialog.component.html',
  imports: [LucideCloudUpload, LucideImage, LucideImagePlus, LucideLink, LucideX],
  styleUrls: ['../room-glass.css', './canvas-image-dialog.component.css'],
})
export class CanvasImageDialogComponent {
  readonly theme = input('');
  readonly dark = input(false);
  readonly linkValue = signal('');
  readonly fileName = signal('');
  private readonly extras = inject(StudyRoomExtras);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private localUrl = '';
  private file?: File;
  readonly preview = signal('');
  readonly dimensions = signal<{ width: number; height: number } | null>(null);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly close = output<void>();
  readonly addImage = output<CanvasImageSource>();

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
    this.destroyRef.onDestroy(() => this.releaseLocalUrl());
  }

  updateLink(value: string): void {
    this.resetPreview();
    this.linkValue.set(value);
  }

  setFile(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (file) this.selectFile(file);
  }

  dropFile(event: DragEvent): void {
    event.preventDefault();
    if (this.uploading()) return;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length !== 1) {
      this.error.set('Chỉ chọn một ảnh mỗi lần.');
      return;
    }
    this.selectFile(files[0]);
  }

  private selectFile(file: File): void {
    this.resetPreview();
    this.linkValue.set('');
    if (!acceptedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.error.set('Chọn ảnh JPEG, PNG, WebP hoặc AVIF, tối đa 10 MB.');
      return;
    }
    this.file = file;
    this.fileName.set(file.name);
    this.localUrl = URL.createObjectURL(file);
    this.showPreview(this.localUrl);
  }

  imageLoaded(event: Event, source: string): void {
    if (source !== this.preview()) return;
    const image = event.target as HTMLImageElement;
    if (!image.naturalWidth || !image.naturalHeight) {
      this.imageFailed(source);
      return;
    }
    this.dimensions.set({ width: image.naturalWidth, height: image.naturalHeight });
    this.loading.set(false);
  }

  imageFailed(source: string): void {
    if (source !== this.preview()) return;
    this.resetPreview();
    this.error.set('Không tải được ảnh. Kiểm tra URL hoặc chọn tệp khác.');
  }

  async submit(): Promise<void> {
    let dimensions = this.dimensions();
    const link = this.linkValue().trim();
    if (this.uploading() || (!dimensions && !link)) return;
    this.uploading.set(true);
    this.error.set('');
    try {
      let url: string;
      if (this.file) {
        url = await this.extras.uploadImage(this.file);
      } else {
        const source = URL.canParse(link) ? new URL(link) : null;
        if (!source || source.protocol !== 'https:' || source.username || source.password || /\.gif$/i.test(source.pathname)) {
          throw new Error('Nhập URL ảnh HTTPS hợp lệ. Ảnh GIF không được hỗ trợ.');
        }
        const image = new Image();
        image.referrerPolicy = 'no-referrer';
        image.src = source.href;
        await image.decode().catch(() => { throw new Error('Không tải được ảnh. Kiểm tra URL rồi thử lại.'); });
        dimensions = { width: image.naturalWidth, height: image.naturalHeight };
        url = source.href;
      }
      if (!dimensions?.width || !dimensions.height) throw new Error('Không đọc được kích thước ảnh.');
      const parsed = new URL(url, location.origin);
      if (parsed.protocol !== 'https:' && !(this.extras.demo && parsed.origin === location.origin)) {
        throw new Error('Máy chủ chưa trả về URL ảnh hợp lệ.');
      }
      if (!this.destroyRef.destroyed) {
        this.dialog().nativeElement.close();
        this.addImage.emit({ url: parsed.href, ...dimensions });
      }
    } catch (error) {
      if (!this.destroyRef.destroyed) this.error.set(error instanceof Error ? error.message : 'Không thể thêm ảnh.');
    } finally {
      if (!this.destroyRef.destroyed) this.uploading.set(false);
    }
  }

  cancel(): void {
    if (this.uploading()) return;
    this.dialog().nativeElement.close();
    this.close.emit();
  }

  private showPreview(url: string): void {
    this.loading.set(true);
    this.preview.set(url);
  }

  private resetPreview(): void {
    this.releaseLocalUrl();
    this.file = undefined;
    this.fileName.set('');
    this.preview.set('');
    this.dimensions.set(null);
    this.loading.set(false);
    this.error.set('');
  }

  private releaseLocalUrl(): void {
    if (this.localUrl) URL.revokeObjectURL(this.localUrl);
    this.localUrl = '';
  }
}
