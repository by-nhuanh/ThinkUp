import { Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BlogService } from '../../../services/blog.service';
import { BlogComment } from '../../../models/blog.model';
import { BlogIconComponent } from '../../../components/blog-icon/blog-icon.component';
interface CommentView extends BlogComment{liked?:boolean;replying?:boolean;optionsOpen?:boolean;}
@Component({selector:'app-blog-discussion',standalone:true,imports:[FormsModule,BlogIconComponent],templateUrl:'./blog-discussion.component.html',styleUrl:'./blog-discussion.component.css'})
export class BlogDiscussionComponent {
  private readonly blog=inject(BlogService);private readonly destroyRef=inject(DestroyRef);
  readonly postId=input.required<string>();readonly comments=signal<CommentView[]>([]);readonly filter=signal('Mới nhất');readonly filterOpen=signal(false);readonly loading=signal(false);readonly submitting=signal(false);readonly error=signal('');readonly visibleCount=signal(5);mainComment='';
  private readonly filterWrap=viewChild<ElementRef<HTMLElement>>('filterWrap');private readonly filterTrigger=viewChild<ElementRef<HTMLButtonElement>>('filterTrigger');
  @HostListener('document:keydown.escape') onEscape():void{if(!this.filterOpen())return;this.filterOpen.set(false);this.filterTrigger()?.nativeElement.focus();}
  @HostListener('document:click',['$event']) onDocumentClick(event:MouseEvent):void{if(!this.filterOpen())return;const wrap=this.filterWrap()?.nativeElement;if(wrap&&!wrap.contains(event.target as Node))this.filterOpen.set(false);}
  readonly visibleComments=computed(()=>{const comments=[...this.comments()];if(this.filter()==='Cũ nhất')comments.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));else if(this.filter()==='Phổ biến')comments.sort((a,b)=>b.likesCount-a.likesCount);else comments.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return comments.slice(0,this.visibleCount());});
  constructor(){effect(onCleanup=>{const id=this.postId();this.error.set('');this.visibleCount.set(5);this.loading.set(true);const subscription=this.blog.comments(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:comments=>{this.comments.set(comments);this.loading.set(false);},error:()=>{this.loading.set(false);this.error.set('Không thể tải bình luận.');}});onCleanup(()=>subscription.unsubscribe());});}
  submit():void{const content=this.mainComment.trim();if(!content||this.submitting())return;this.submitting.set(true);this.error.set('');this.blog.addComment(this.postId(),this.blog.currentAuthor()?.name || 'Bạn',content).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:comment=>{this.comments.update(comments=>[comment,...comments]);this.mainComment='';this.submitting.set(false);},error:()=>{this.submitting.set(false);this.error.set('Không thể gửi bình luận. Vui lòng thử lại.');}});}
  like(comment:CommentView):void{this.comments.update(comments=>comments.map(item=>item.id===comment.id?{...item,liked:!item.liked,likesCount:Math.max(0,item.likesCount+(item.liked?-1:1))}:item));}
  readonly increaseCount=(count:number)=>count+5;
  date(value:string):string{return new Date(value).toLocaleDateString('vi-VN');}
}
