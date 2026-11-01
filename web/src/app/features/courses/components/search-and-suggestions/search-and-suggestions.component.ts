import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-and-suggestions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-and-suggestions.component.html',
  styleUrl: './search-and-suggestions.component.css'
})
export class SearchAndSuggestionsComponent {
  @Input() searchQuery = '';
  @Input() suggestedTags: string[] = [];
  @Input() selectedTags: string[] = [];
  @Output() search = new EventEmitter<string>();
  @Output() tagToggle = new EventEmitter<string>();

  readonly showAllTags = signal(false);

  visibleTags(): string[] {
    return this.showAllTags() ? this.suggestedTags : this.suggestedTags.slice(0, 6);
  }

  hasMoreTags(): boolean {
    return this.suggestedTags.length > 6;
  }

  toggleAllTags(): void {
    this.showAllTags.update(value => !value);
  }

  submitSearch(): void {
    this.search.emit(this.searchQuery);
  }

  toggleTag(tag: string): void {
    this.tagToggle.emit(tag);
  }
}
