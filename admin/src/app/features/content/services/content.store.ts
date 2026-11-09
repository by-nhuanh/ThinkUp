import { Signal } from '@angular/core';
import { ContentComment, ContentPost, ContentReport, ContentReview, ModerationLog } from '../models/content.models';

/** Replaceable contract so the demo data source can be swapped for the real content API. */
export abstract class ContentStore {
  abstract readonly posts: Signal<readonly ContentPost[]>;
  abstract readonly comments: Signal<readonly ContentComment[]>;
  abstract readonly reviews: Signal<readonly ContentReview[]>;
  abstract readonly reports: Signal<readonly ContentReport[]>;
  abstract readonly logs: Signal<readonly ModerationLog[]>;
  abstract readonly loadError: Signal<boolean>;

  abstract retry(): void;
  abstract updatePost(id: string, patch: Partial<ContentPost>, note: string): void;
  abstract createPost(post: ContentPost): void;
  abstract removePosts(ids: string[]): void;
  abstract updateComment(id: string, patch: Partial<ContentComment>, note: string): void;
  abstract removeComments(ids: string[]): void;
  abstract replyComment(id: string, content: string, actor: string): void;
  abstract updateReview(id: string, patch: Partial<ContentReview>, note: string): void;
  abstract replyReview(id: string, content: string, actor: string): void;
  abstract removeReviews(ids: string[]): void;
  abstract updateReport(id: string, patch: Partial<ContentReport>, note: string): void;
  abstract reset(): void;
}
