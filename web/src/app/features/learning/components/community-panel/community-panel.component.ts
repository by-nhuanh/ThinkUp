import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommunityPost, CommunityReply } from '../../models/learning.model';

@Component({ selector:'app-community-panel', standalone:true, imports:[FormsModule], templateUrl:'./community-panel.component.html', styleUrls:['./community-panel.component.css','./community-panel-figma.component.css'] })
export class CommunityPanelComponent {
  readonly mode = input.required<'qa'|'discussion'>();
  readonly initialPosts = input.required<CommunityPost[]>();
  readonly posts = signal<CommunityPost[]>([]);
  readonly reportTarget = signal<{ id:string; label:string }|null>(null);
  readonly reportSent = signal(false);
  readonly replyTarget = signal<string|null>(null);
  draft = ''; replyDraft = ''; reportReason = '';

  ngOnInit(): void { this.posts.set(structuredClone(this.initialPosts())); }
  addPost(): void {
    const body = this.draft.trim(); if (!body) return;
    this.posts.update(items => [{ id:`post-${Date.now()}`, author:'Bạn', initials:'B', body, createdAt:'Vừa xong', likes:0, replies:[] }, ...items]);
    this.draft = '';
  }
  toggleLike(id:string): void { this.posts.update(items => this.mapItem(items,id,item => ({...item, liked:!item.liked, likes:item.likes+(item.liked?-1:1)}))); }
  addReply(postId:string): void {
    const body=this.replyDraft.trim(); if(!body)return;
    this.posts.update(items => items.map(post => post.id===postId ? {...post,replies:[...post.replies,{id:`reply-${Date.now()}`,author:'Bạn',initials:'B',body,createdAt:'Vừa xong',likes:0}]} : post));
    this.replyDraft=''; this.replyTarget.set(null);
  }
  openReport(id:string, author:string): void { this.reportReason=''; this.reportSent.set(false); this.reportTarget.set({id,label:`Nội dung của ${author}`}); }
  submitReport(): void { if(!this.reportReason.trim())return; this.reportSent.set(true); }
  closeReport(): void { this.reportTarget.set(null); }
  avatarFor(author:string):string { const index=author.includes('Trần')?2:author.includes('Lê')?3:1; return `/assets/learning/discussion-avatar-${index}.webp`; }
  private mapItem(posts:CommunityPost[],id:string,change:(item:CommunityPost|CommunityReply)=>CommunityPost|CommunityReply): CommunityPost[] {
    return posts.map(post => post.id===id ? change(post) as CommunityPost : {...post,replies:post.replies.map(reply => reply.id===id ? change(reply) as CommunityReply : reply)});
  }
}

