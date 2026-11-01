import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { FAQ_CATEGORIES, FaqItem } from '../data/support.data';

@Component({ selector: 'app-help-center', standalone: true, imports: [RouterLink, IconComponent], templateUrl: './help-center.component.html', styleUrl: './help-center.component.css' })
export class HelpCenterComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  readonly categories = FAQ_CATEGORIES;
  readonly activeCategoryId = signal('payment');
  readonly openQuestion = signal(0);
  readonly query = signal('');
  readonly searched = signal(false);
  private schema?: HTMLScriptElement;

  get activeCategory() { return this.categories.find(item => item.id === this.activeCategoryId()) ?? this.categories[1]; }
  get visibleItems(): FaqItem[] {
    const query = this.query().trim().toLocaleLowerCase('vi');
    if (query.length < 2) return this.activeCategory.items;
    return this.categories.flatMap(category => category.items).filter(item => `${item.question} ${item.answer}`.toLocaleLowerCase('vi').includes(query));
  }

  ngOnInit(): void {
    const category = this.route.snapshot.queryParamMap.get('category');
    if (category && this.categories.some(item => item.id === category)) this.activeCategoryId.set(category);
    this.updateSeo();
    this.schema = this.document.createElement('script');
    this.schema.type = 'application/ld+json';
    this.schema.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: this.categories.flatMap(c => c.items).map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) });
    this.document.head.appendChild(this.schema);
  }
  ngOnDestroy(): void { this.schema?.remove(); }
  selectCategory(id: string): void { this.activeCategoryId.set(id); this.query.set(''); this.searched.set(false); this.openQuestion.set(0); this.updateSeo(); }
  search(value: string): void { this.query.set(value.trim()); this.searched.set(this.query().length >= 2); this.openQuestion.set(this.visibleItems.length ? 0 : -1); }
  toggleQuestion(index: number): void { this.openQuestion.set(this.openQuestion() === index ? -1 : index); }
  questionId(index: number): string { return `faq-answer-${index}`; }
  private updateSeo(): void {
    this.title.setTitle(`Trung tâm trợ giúp ThinkUp - ${this.activeCategory.label}`);
    this.meta.updateTag({ name: 'description', content: `Giải đáp ${this.activeCategory.label} và hướng dẫn sử dụng ThinkUp.` });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
  }
}
