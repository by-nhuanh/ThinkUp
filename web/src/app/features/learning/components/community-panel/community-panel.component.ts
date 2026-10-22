import { Component, OnDestroy, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { CommunityPost, CommunityReply } from '../../models/learning.model';

type ReportCategory = 'spam' | 'abusive' | 'copyright';

@Component({ selector:'app-community-panel', standalone:true, imports:[FormsModule], templateUrl:'./community-panel.component.html', styleUrls:['./community-panel-figma.component.css','./community-panel.component.css'] })
export class CommunityPanelComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  readonly mode = input.required<'qa'|'discussion'>();
  readonly lessonId = input.required<string>();
  readonly initialPosts = input.required<CommunityPost[]>();
  readonly countChange = output<number>();
  readonly posts = signal<CommunityPost[]>([]);
  readonly reportTarget = signal<{ id:string; label:string }|null>(null);
  readonly reportSent = signal(false);
  readonly replyTarget = signal<string|null>(null);
  readonly expandedReplies = signal<Set<string>>(new Set());
  readonly emojiOpen = signal(false);
  readonly cooldownRemaining = signal(0);
  readonly attachmentPreview = signal<string|null>(null);
  readonly validationMessage = signal('');
  draft = '';
  replyDraft = '';
  reportCategory: ReportCategory | '' = '';
  reportDetails = '';
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  readonly emojis = ['😀','👍','🎉','💡','❤️','👏'];

  ngOnInit(): void {
    this.posts.set(structuredClone(this.initialPosts()));
    this.countChange.emit(this.posts().length);
    this.restoreCooldown();
  }

  get canSubmit(): boolean {
    const length = this.draft.trim().length;
    return length >= 1 && length <= 1000 && this.cooldownRemaining() === 0;
  }

  get canReply(): boolean {
    const length = this.replyDraft.trim().length;
    return length >= 1 && length <= 1000 && this.cooldownRemaining() === 0;
  }

  get initialsForUser(): string {
    return this.initialsFor(this.authService.currentUser()?.full_name || 'Bạn');
  }

  addPost(): void {
    const body = this.normalizeText(this.draft);
    if (!this.validate(body)) return;
    const user = this.authService.currentUser();
    this.posts.update(items => [{ id:`post-${Date.now()}`, author:user?.full_name || 'Bạn', initials:this.initialsFor(user?.full_name || 'Bạn'), body, createdAt:'Hôm nay, vừa xong', likes:0, replies:[], attachmentDataUrl:this.attachmentPreview() || undefined }, ...items]);
    this.draft = '';
    this.attachmentPreview.set(null);
    this.emojiOpen.set(false);
    this.validationMessage.set('');
    this.countChange.emit(this.posts().length);
    this.beginCooldown();
    // TODO(pre-deploy): Nhớ thay cập nhật state local bằng Comments API theo hợp đồng backend chính thức.
  }

  toggleLike(id:string): void {
    this.posts.update(items => this.mapItem(items,id,item => ({...item, liked:!item.liked, likes:item.likes+(item.liked?-1:1)})));
  }

  addReply(postId:string): void {
    const body = this.normalizeText(this.replyDraft);
    if (!this.validate(body)) return;
    const user = this.authService.currentUser();
    const reply: CommunityReply = {id:`reply-${Date.now()}`,author:user?.full_name || 'Bạn',initials:this.initialsFor(user?.full_name || 'Bạn'),body,createdAt:'Hôm nay, vừa xong',likes:0};
    this.posts.update(items => items.map(post => post.id===postId ? {...post,replies:[...post.replies,reply]} : post));
    this.replyDraft='';
    this.replyTarget.set(null);
    this.expandedReplies.update(ids => new Set(ids).add(postId));
    this.validationMessage.set('');
    this.beginCooldown();
  }

  toggleReplies(postId:string): void {
    this.expandedReplies.update(ids => {
      const next = new Set(ids);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  }

  visibleReplies(post:CommunityPost): CommunityReply[] {
    return this.expandedReplies().has(post.id) ? post.replies : post.replies.slice(0,1);
  }

  insertEmoji(emoji:string): void {
    this.draft = `${this.draft}${emoji}`.slice(0,1000);
    this.emojiOpen.set(false);
  }

  selectImage(event:Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.validationMessage.set('Chỉ hỗ trợ ảnh có dung lượng tối đa 5 MB.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.attachmentPreview.set(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  autoResize(event:Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    this.validationMessage.set(this.draft.length > 1000 ? 'Bình luận không được vượt quá 1.000 ký tự.' : '');
  }

  openReport(id:string, author:string): void {
    this.reportCategory='';
    this.reportDetails='';
    this.reportSent.set(false);
    this.reportTarget.set({id,label:`Nội dung của ${author}`});
  }

  submitReport(): void {
    if (!this.reportCategory) return;
    this.reportSent.set(true);
    // TODO(pre-deploy): Nhớ gửi lý do báo cáo qua Moderation API khi backend bàn giao endpoint.
  }

  closeReport(): void { this.reportTarget.set(null); }
  avatarFor(author:string):string { const index=author.includes('Trần')?2:author.includes('Lê')?3:1; return `/assets/learning/discussion-avatar-${index}.png`; }

  ngOnDestroy(): void { if (this.cooldownTimer) clearInterval(this.cooldownTimer); }

  private validate(body:string): boolean {
    if (!body) { this.validationMessage.set('Nội dung không được để trống.'); return false; }
    if (body.length > 1000) { this.validationMessage.set('Nội dung không được vượt quá 1.000 ký tự.'); return false; }
    if (this.cooldownRemaining() > 0) { this.validationMessage.set(`Vui lòng chờ ${this.cooldownRemaining()} giây trước khi đăng tiếp.`); return false; }
    return true;
  }

  private normalizeText(value:string): string { return value.replace(/\s+/g,' ').trim(); }
  private initialsFor(name:string): string { return name.split(/\s+/).slice(-2).map(part=>part[0]?.toUpperCase()??'').join('') || 'B'; }

  private beginCooldown(): void {
    const until = Date.now()+5000;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(this.cooldownKey(),String(until));
    this.runCooldown(until);
  }

  private restoreCooldown(): void {
    if (typeof sessionStorage === 'undefined') return;
    const until=Number(sessionStorage.getItem(this.cooldownKey())??0);
    if (until>Date.now()) this.runCooldown(until);
  }

  private runCooldown(until:number): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    const update=()=>{
      const remaining=Math.max(0,Math.ceil((until-Date.now())/1000));
      this.cooldownRemaining.set(remaining);
      if(remaining===0&&this.cooldownTimer){clearInterval(this.cooldownTimer);this.cooldownTimer=null;}
    };
    update();
    this.cooldownTimer=setInterval(update,250);
  }

  private cooldownKey():string { return `thinkup_comment_cooldown_${this.lessonId()}_${this.mode()}`; }
  private mapItem(posts:CommunityPost[],id:string,change:(item:CommunityPost|CommunityReply)=>CommunityPost|CommunityReply): CommunityPost[] {
    return posts.map(post => post.id===id ? change(post) as CommunityPost : {...post,replies:post.replies.map(reply => reply.id===id ? change(reply) as CommunityReply : reply)});
  }
}
