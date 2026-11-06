import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { BlogService } from '../services/blog.service';
import { BlogDraft, BlogPost } from '../models/blog.model';
import { EDITOR_CATEGORIES, EMPTY_BLOG_DRAFT } from '../data/blog-options';
import { createBlogSlug, prepareBlogHtml } from '../utils/blog-content';
import { BlogIconComponent } from '../components/blog-icon/blog-icon.component';
import { BlogAuthModalComponent } from '../components/blog-auth-modal/blog-auth-modal.component';
import { BlogStatusBadgeComponent } from '../components/blog-status-badge/blog-status-badge.component';
import { BlogTagInputComponent } from '../components/blog-tag-input/blog-tag-input.component';
import { BlogImageUploadComponent } from '../components/blog-image-upload/blog-image-upload.component';
import { RichTextEditorComponent } from './components/rich-text-editor/rich-text-editor.component';
import { AuthService } from '../../../core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
@Component({ selector:'app-create-post',standalone:true,imports:[FormsModule,RouterLink,BlogIconComponent,BlogAuthModalComponent,BlogStatusBadgeComponent,BlogTagInputComponent,BlogImageUploadComponent,RichTextEditorComponent],templateUrl:'./create-post.component.html',styleUrl:'./create-post.component.css' })
export class CreatePostComponent {
  private readonly blog=inject(BlogService);private readonly auth=inject(AuthService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroyRef=inject(DestroyRef);
  post:BlogDraft=structuredClone(EMPTY_BLOG_DRAFT);
  categories=[...EDITOR_CATEGORIES]; coverImage:File|string|null=null; contentImages:string[]=[];
  readonly errors=signal<Partial<Record<keyof BlogDraft|'coverImage'|'contentImages',string>>>({});readonly submitting=signal(false);readonly loading=signal(false);readonly previewOpen=signal(false);readonly message=signal('');readonly authModal=signal(!this.auth.isAuthenticated());readonly editId=signal('');
  readonly uploadingContentImage=signal(false);
  private activeId='';
  get isPublished():boolean{return this.post.status==='published'||this.post.status==='updated';}
  constructor(){this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params=>{this.editId.set(params.get('postId')||'');this.activeId=this.editId();this.post=structuredClone(EMPTY_BLOG_DRAFT);this.coverImage=null;this.contentImages=[];this.loadPost();});}
  private loadPost():void{const owner=this.blog.currentAuthor();if(!owner||!this.auth.isAuthenticated())return;this.loading.set(true);this.blog.list({ownerEmail:owner.email,page:1,limit:50}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:result=>{const saved=this.editId()?result.posts.find(item=>item.id===this.editId()):result.posts.find(item=>item.status==='draft');if(saved)this.applyPost(saved);else if(this.editId()){this.message.set('Không tìm thấy bài viết thuộc tài khoản này.');void this.router.navigateByUrl('/main/blog/manage');}this.loading.set(false);},error:()=>{this.loading.set(false);this.message.set('Không thể tải bài viết. Vui lòng thử lại.');}});}
  private applyPost(saved:BlogPost):void{this.activeId=saved.id;this.post={...structuredClone(EMPTY_BLOG_DRAFT),...saved,summary:saved.description,categories:saved.categories?.length?saved.categories:[saved.category],status:saved.status||'draft'};this.coverImage=saved.coverImage||null;this.contentImages=saved.contentImages||[];this.categories=[...new Set([...EDITOR_CATEGORIES,...this.post.categories])];}
  updateTitle(title:string):void{this.post.title=title;this.post.slug=createBlogSlug(title);this.errors.update(errors=>({...errors,title:''}));}
  updateSlug(slug:string):void{this.post.slug=createBlogSlug(slug);}
  toggleCategory(category:string):void{this.post.categories=this.post.categories.includes(category)?this.post.categories.filter(item=>item!==category):[...this.post.categories,category];this.errors.update(errors=>({...errors,categories:''}));}
  addCategory():void{const value=window.prompt('Tên danh mục mới')?.trim();if(!value||this.categories.includes(value))return;this.categories.push(value);this.post.categories.push(value);}
  addImage(url:string):void{if(!this.contentImages.includes(url))this.contentImages.push(url);}
  async uploadContentImages(event:Event):Promise<void>{
    const input=event.target as HTMLInputElement;
    const files=Array.from(input.files || []);
    input.value='';
    if(!files.length)return;
    if(this.contentImages.length+files.length>10){this.message.set('Bạn chỉ có thể thêm tối đa 10 ảnh trong bài viết.');return;}
    this.uploadingContentImage.set(true);
    try{
      for(const file of files){
        if(!file.type.startsWith('image/')||file.size>5*1024*1024)throw new Error('Mỗi ảnh phải đúng định dạng và không vượt quá 5MB.');
        this.addImage(await firstValueFrom(this.blog.upload(file, 'content')));
      }
      this.errors.update(errors=>({...errors,contentImages:''}));
    }catch(error){
      const apiMessage=error instanceof HttpErrorResponse?(error.error as {message?:string}|null)?.message:undefined;
      this.message.set(apiMessage||(!(error instanceof HttpErrorResponse)&&error instanceof Error?error.message:'Không thể tải ảnh lên. Vui lòng thử lại.'));
    }
    finally{this.uploadingContentImage.set(false);}
  }
  removeContentImage(url:string):void{this.contentImages=this.contentImages.filter(image=>image!==url);}
  closeAuth():void{this.authModal.set(false);this.router.navigateByUrl('/main/blog');}
  async save(publish:boolean):Promise<void>{
    if(this.submitting())return;const owner=this.blog.currentAuthor();if(!owner||!this.auth.isAuthenticated()){this.authModal.set(true);return;}
    const errors:Partial<Record<keyof BlogDraft|'coverImage'|'contentImages',string>>={};
    const title=this.post.title.trim();
    if(!title)errors.title='Vui lòng nhập tiêu đề bài viết';
    if(publish){
      if(title && (title.length<5 || title.length>100))errors.title='Tiêu đề phải có từ 5 đến 100 ký tự';
      const words=this.post.content.replace(/<[^>]*>/g,' ').trim().split(/\s+/).filter(Boolean).length;
      if(words<50)errors.content=`Nội dung cần ít nhất 50 từ (hiện có ${words} từ)`;
      if(!this.coverImage)errors.coverImage='Vui lòng chọn ảnh đại diện';
      if(!this.post.categories.length)errors.categories='Vui lòng chọn ít nhất một danh mục';
    }
    this.errors.set(errors);if(Object.keys(errors).length){this.message.set('Vui lòng hoàn thành các trường bắt buộc.');window.scrollTo({top:0,behavior:'smooth'});return;}
    this.submitting.set(true);this.message.set('');
    try{const cover=this.coverImage instanceof File?await firstValueFrom(this.blog.upload(this.coverImage)):this.coverImage||'/assets/blog/article-1.jpg';const status=this.isPublished?'updated':publish?'published':'draft';const result=await firstValueFrom(this.blog.save({...this.post,id:this.activeId||undefined,title:this.post.title.trim()||'Bài viết chưa có tiêu đề',content:prepareBlogHtml(this.post.content),ownerEmail:owner.email,author:owner.name,status,coverImage:cover,contentImages:this.contentImages}));this.activeId=result.id;await this.router.navigateByUrl('/main/blog/manage');}
    catch(error){
      if(error instanceof HttpErrorResponse){
        const response=error.error as { message?:string; field?:keyof BlogDraft|'coverImage'|'contentImages' }|null;
        if(response?.field)this.errors.update(current=>({...current,[response.field!]:response.message||'Dữ liệu không hợp lệ'}));
        this.message.set(response?.message||'Không thể lưu bài viết. Vui lòng thử lại.');
      }else this.message.set(error instanceof Error?error.message:'Không thể lưu bài viết. Vui lòng thử lại.');
    }
    finally{this.submitting.set(false);}
  }
  preview():void{this.post.content=prepareBlogHtml(this.post.content);this.previewOpen.set(true);}
}
