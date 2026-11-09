import { Provider } from '@angular/core';
import { ContentDemoService } from './content-demo.service';
import { ContentStore } from './content.store';

// TODO(pre-deploy): Nhớ đổi sang adapter HTTP khi API quản lý nội dung được xác minh.
export const CONTENT_PROVIDERS: Provider[] = [
  { provide: ContentStore, useClass: ContentDemoService }
];
