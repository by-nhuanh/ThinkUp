import { LucideDynamicIcon } from '@lucide/angular';
import { BLOG_ICONS } from '../data/blog-icons';
import { BlogImageSrcsetPipe } from '../pipes/blog-image-srcset.pipe';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { BlogService } from '../services/blog.service';
import { BlogDetailResponse, BlogReaction } from '../models/blog.model';
import { prepareBlogHtml, getBlogHeadings } from '../utils/blog-content';
import { BlogIconComponent } from '../components/blog-icon/blog-icon.component';
import { BlogSidebarComponent } from '../components/blog-sidebar/blog-sidebar.component';
import { BlogDiscussionComponent } from './components/blog-discussion/blog-discussion.component';
import { ArticleContentDirective } from './article-content.directive';
@Component({selector:'app-article-detail',standalone:true,imports:[LucideDynamicIcon,BlogImageSrcsetPipe,RouterLink,BlogIconComponent,BlogSidebarComponent,BlogDiscussionComponent,ArticleContentDirective],templateUrl:'./article-detail.component.html',styleUrl:'./article-detail.component.css'})
export class ArticleDetailComponent {
  readonly icons = BLOG_ICONS;
  private readonly route=inject(ActivatedRoute);private readonly blog=inject(BlogService);
  readonly detail=signal<BlogDetailResponse|null>(null);readonly loading=signal(true);readonly error=signal('');readonly expanded=signal(true);readonly reaction=signal<BlogReaction>('none');readonly reacting=signal(false);readonly copied=signal(false);readonly shareError=signal('');
  readonly headings=computed(()=>getBlogHeadings(this.detail()?.post.content || ''));
  readonly initials=computed(()=>(this.detail()?.post.author||'?').split(' ').map(part=>part[0]).join('').substring(0,2).toUpperCase());
  readonly tags=computed(()=>[...(this.detail()?.post.topics||[]),...(this.detail()?.post.tags||[])]);
  constructor(){this.route.paramMap.pipe(takeUntilDestroyed(),switchMap(params=>{this.loading.set(true);this.error.set('');this.expanded.set(true);return this.blog.detail(params.get('id')||'').pipe(catchError(()=>{this.error.set('Bài viết không tồn tại hoặc không thể tải.');return of(null);}));})).subscribe(detail=>{this.detail.set(detail?{...detail,post:{...detail.post,content:prepareBlogHtml(detail.post.content,true)}}:null);this.reaction.set(detail?.userInteraction||'none');this.loading.set(false);window.scrollTo({top:0});});}
  react(action:'like'|'dislike'):void{const id=this.detail()?.post.id;if(!id||this.reacting())return;const next=this.reaction()===action?'none':action;this.reacting.set(true);this.blog.react(id,next).subscribe({next:()=>{this.reaction.set(next);this.reacting.set(false);},error:()=>{this.reacting.set(false);this.shareError.set('Không thể lưu phản hồi. Vui lòng thử lại.');}});}
  async copyLink():Promise<void>{try{await navigator.clipboard.writeText(window.location.href);this.copied.set(true);setTimeout(()=>this.copied.set(false),2000);}catch{this.shareError.set('Không thể sao chép liên kết.');}}
  share(network:'facebook'|'linkedin'):void{const url=encodeURIComponent(window.location.href);window.open(network==='facebook'?`https://www.facebook.com/sharer/sharer.php?u=${url}`:`https://www.linkedin.com/sharing/share-offsite/?url=${url}`,'_blank','noopener,noreferrer');}
}
