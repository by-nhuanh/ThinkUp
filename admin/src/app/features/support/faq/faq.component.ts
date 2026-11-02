import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FAQ_CATEGORIES } from '../../../core/data/mock/support.mock';
import { LucideBold, LucideBookOpenText, LucideChartNoAxesColumnIncreasing, LucideCircleAlert, LucideCircleHelp, LucideEye, LucideEyeOff, LucideFileText, LucideFolder, LucideItalic, LucideLink, LucideList, LucideListOrdered, LucidePencil, LucidePencilLine, LucidePlus, LucideSave, LucideSearch, LucideSearchX, LucideSend, LucideTag, LucideTrash2, LucideTrendingDown, LucideTriangleAlert, LucideUnderline, LucideX } from '@lucide/angular';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { FaqItem, FaqStatus, FailedSearch } from '../models/support.models';
import { SupportDemoService } from '../services/support-demo.service';
import { SupportPaginationComponent } from '../components/support-pagination/support-pagination.component';

@Component({ selector:'app-support-faq',standalone:true,imports:[FormsModule, SupportPaginationComponent, CustomSelectComponent, LucideBold, LucideBookOpenText, LucideChartNoAxesColumnIncreasing, LucideCircleAlert, LucideCircleHelp, LucideEye, LucideEyeOff, LucideFileText, LucideFolder, LucideItalic, LucideLink, LucideList, LucideListOrdered, LucidePencil, LucidePencilLine, LucidePlus, LucideSave, LucideSearch, LucideSearchX, LucideSend, LucideTag, LucideTrash2, LucideTrendingDown, LucideTriangleAlert, LucideUnderline, LucideX],templateUrl:'./faq.component.html',styleUrls:['../support-page.css','./faq.component.css'] })
export class FaqComponent {
  private readonly data=inject(SupportDemoService);readonly faqs=this.data.faqs;readonly failed=this.data.failedSearches;readonly categories=FAQ_CATEGORIES;
  readonly categoryOptions = computed<ReadonlyArray<CustomSelectOption>>(() => [
    { value: '', label: 'Tất cả 7 nhóm' },
    ...this.categories.map(c => ({ value: c, label: c }))
  ]);
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả' },
    { value: 'published', label: 'Đã xuất bản' },
    { value: 'hidden', label: 'Tạm ẩn' }
  ];
  readonly editorCategoryOptions = computed<ReadonlyArray<CustomSelectOption>>(() => [
    ...this.categories.map(c => ({ value: c, label: c }))
  ]);

  setStatusFilter(v: string): void { this.status.set(v as FaqStatus | ''); this.page.set(1); }
  setFormStatus(v: string): void { this.patch('status', v as FaqStatus); }
  readonly editorStatusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'published', label: 'Đang hiển thị' },
    { value: 'hidden', label: 'Tạm ẩn' }
  ];
  readonly answerFormatOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'paragraph', label: 'Đoạn văn' },
    { value: 'heading', label: 'Tiêu đề nhỏ' },
    { value: 'quote', label: 'Trích dẫn' }
  ];
  readonly queryInput=signal('');readonly query=signal('');readonly category=signal('');readonly status=signal<FaqStatus|''>('');readonly page=signal(1);readonly pageSize=7;readonly modal=signal<'editor'|'failed'|'delete'|'status'|null>(null);readonly editing=signal<FaqItem|null>(null);readonly deleting=signal<FaqItem|null>(null);readonly pendingStatusChange=signal<{item:FaqItem;target:FaqStatus}|null>(null);readonly form=signal<FaqItem>(this.blank());readonly keywordDraft=signal('');readonly answerFormat=signal('paragraph');readonly answerPreview=signal(false);readonly orderDrafts=signal<Record<string,number>>({});readonly attempted=signal(false);readonly toast=signal('');private searchTimer?:ReturnType<typeof setTimeout>;private modalOrigin:HTMLElement|null=null;
  readonly filtered=computed(()=>this.faqs().filter(item=>{const q=this.query().trim().toLocaleLowerCase('vi-VN');return(!q||[item.question,item.answer,...item.keywords].some(v=>v.toLocaleLowerCase('vi-VN').includes(q)))&&(!this.category()||item.category===this.category())&&(!this.status()||item.status===this.status())}).sort((a,b)=>a.category.localeCompare(b.category,'vi')||a.order-b.order));readonly pages=computed(()=>Math.max(1,Math.ceil(this.filtered().length/this.pageSize)));readonly visible=computed(()=>this.filtered().slice((this.page()-1)*this.pageSize,this.page()*this.pageSize));readonly published=computed(()=>this.faqs().filter(i=>i.status==='published').length);readonly totalViews=computed(()=>this.faqs().reduce((s,i)=>s+i.views,0));readonly failedSorted=computed(()=>[...this.failed()].sort((a,b)=>b.count-a.count||a.keyword.localeCompare(b.keyword,'vi')));readonly failedCount=computed(()=>this.failed().reduce((s,i)=>s+i.count,0));
  blank(prefillQuestion='',suggested=''):FaqItem{return{id:`FAQ-${Date.now()}`,question:prefillQuestion,answer:'',category:suggested,keywords:prefillQuestion?[prefillQuestion]:[],views:0,order:1,status:'published',updatedAt:new Date().toISOString()}}
  setSearch(v:string):void{this.queryInput.set(v);clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>{this.query.set(v);this.page.set(1)},300)}
  openEditor(item?:FaqItem):void{this.attempted.set(false);this.keywordDraft.set('');this.answerFormat.set('paragraph');this.answerPreview.set(false);this.editing.set(item??null);this.form.set(item?structuredClone(item):this.blank());this.openModal('editor')}
  patch<K extends keyof FaqItem>(key:K,value:FaqItem[K]):void{this.form.update(item=>({...item,[key]:value}))}
  keywords(value:string):void{this.patch('keywords',value.split(',').map(v=>v.trim()).filter(Boolean))}
  addKeyword(value=this.keywordDraft()):void{const keyword=value.replace(/,+$/,'').trim();if(keyword&&!this.form().keywords.some(item=>item.toLocaleLowerCase('vi-VN')===keyword.toLocaleLowerCase('vi-VN')))this.patch('keywords',[...this.form().keywords,keyword]);this.keywordDraft.set('')}
  removeKeyword(keyword:string):void{this.patch('keywords',this.form().keywords.filter(item=>item!==keyword))}
  onKeywordKeydown(event:KeyboardEvent):void{if(event.key!=='Enter'&&event.key!==',')return;event.preventDefault();this.addKeyword()}
  setAnswerFormat(value:string,textarea:HTMLTextAreaElement):void{this.answerFormat.set(value);if(value==='paragraph')return;const current=this.form().answer;const start=textarea.selectionStart??current.length;const end=textarea.selectionEnd??start;const selected=current.slice(start,end)||'Nội dung';const insertion=value==='heading'?`## ${selected}`:`> ${selected}`;this.patch('answer',`${current.slice(0,start)}${insertion}${current.slice(end)}`.slice(0,500));setTimeout(()=>textarea.focus())}
  orderInvalid():boolean{const order=Number(this.form().order);return!Number.isInteger(order)||order<1}
  valid():boolean{const v=this.form();return!!v.category&&v.question.trim().length>0&&v.question.trim().length<=150&&v.answer.trim().length>0&&v.answer.trim().length<=500&&Number.isInteger(Number(v.order))&&Number(v.order)>0}
  save():void{this.attempted.set(true);if(!this.valid())return;const value={...this.form(),question:this.form().question.trim(),answer:this.sanitize(this.form().answer.trim()),updatedAt:new Date().toISOString()};this.data.saveFaq(value);this.closeModal();this.toast.set(this.editing()?'Đã lưu thay đổi FAQ.':'Đã tạo FAQ mới.');setTimeout(()=>this.toast.set(''),3000)}
  sanitize(value:string):string{return value.replace(/<[^>]*>/g,'').replace(/javascript:/gi,'')}
  setStatus(item:FaqItem,status:FaqStatus):void{this.data.setFaqStatus(item.id,status);this.toast.set(status==='published'?'FAQ đã được xuất bản.':'Đã cập nhật trạng thái FAQ.');setTimeout(()=>this.toast.set(''),2500)}
  askStatusChange(item:FaqItem,target:FaqStatus):void{this.pendingStatusChange.set({item,target});this.openModal('status')}
  confirmStatusChange():void{const change=this.pendingStatusChange();if(!change)return;this.data.setFaqStatus(change.item.id,change.target);this.closeModal();this.toast.set(change.target==='published'?'FAQ đã được xuất bản.':'FAQ đã được chuyển sang trạng thái Tạm ẩn.');setTimeout(()=>this.toast.set(''),3000)}
  askDelete(item:FaqItem):void{this.deleting.set(item);this.openModal('delete')}
  confirmDelete():void{const item=this.deleting();if(!item)return;this.data.deleteFaq(item.id);this.closeModal();this.deleting.set(null);this.toast.set('Đã xóa FAQ và cập nhật lại thứ tự.');setTimeout(()=>this.toast.set(''),3000)}
  fromFailed(item:FailedSearch):void{this.editing.set(null);this.keywordDraft.set('');this.answerFormat.set('paragraph');this.answerPreview.set(false);this.form.set(this.blank(item.keyword,item.suggestedCategory));this.attempted.set(false);this.modal.set('editor');this.focusModal()}
  setOrderDraft(id:string,value:number):void{this.orderDrafts.update(items=>({...items,[id]:value}))}
  orderValue(item:FaqItem):number{return this.orderDrafts()[item.id]??item.order}
  saveOrder(item:FaqItem):void{const order=this.orderValue(item);if(!Number.isInteger(order)||order<1){this.toast.set('Thứ tự phải là số nguyên lớn hơn 0.');return}this.data.reorderFaq(item.id,order);this.orderDrafts.update(items=>{const next={...items};delete next[item.id];return next});this.toast.set('Đã cập nhật thứ tự trong nhóm.');setTimeout(()=>this.toast.set(''),2500)}
  insertAnswer(textarea:HTMLTextAreaElement,kind:'bold'|'italic'|'underline'|'bullet'|'number'|'link'):void{const value=this.form().answer;const start=textarea.selectionStart??value.length;const end=textarea.selectionEnd??start;const selected=value.slice(start,end)||'Nội dung';const insertion=kind==='bold'?`**${selected}**`:kind==='italic'?`*${selected}*`:kind==='underline'?`<u>${selected}</u>`:kind==='bullet'?`- ${selected}`:kind==='number'?`1. ${selected}`:`[${selected}](https://)`;const next=`${value.slice(0,start)}${insertion}${value.slice(end)}`.slice(0,500);this.patch('answer',next);setTimeout(()=>{textarea.focus();textarea.setSelectionRange(start+insertion.length,start+insertion.length)})}
  openModal(type:'editor'|'failed'|'delete'|'status'):void{this.modalOrigin=document.activeElement instanceof HTMLElement?document.activeElement:null;this.modal.set(type);this.focusModal()}
  closeModal():void{const closing=this.modal();this.modal.set(null);if(closing==='status')this.pendingStatusChange.set(null);setTimeout(()=>this.modalOrigin?.focus())}
  private focusModal():void{setTimeout(()=>document.querySelector<HTMLElement>('.support-modal button, .support-modal input, .support-modal select, .support-modal textarea')?.focus())}
  pageTo(v:number):void{this.page.set(Math.max(1,Math.min(this.pages(),v)))}
  @HostListener('document:keydown.escape') onEscape():void{if(this.modal())this.closeModal()}
  @HostListener('document:keydown.tab',['$event']) trapFocus(domEvent:Event):void{if(!this.modal())return;const event=domEvent as KeyboardEvent;const modal=document.querySelector<HTMLElement>('.support-modal');const controls=modal?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
}
