import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface LessonNote {
  id: string;
  body: string;
  updatedAt: string;
}

const NOTES_KEY = 'thinkup_lesson_notes';

@Component({
  selector: 'app-lesson-notes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lesson-notes.component.html',
  styleUrl: './lesson-notes.component.css'
})
export class LessonNotesComponent {
  readonly lessonId = input.required<string>();
  readonly countChange = output<number>();
  readonly notes = signal<LessonNote[]>([]);
  readonly editingId = signal<string | null>(null);
  draft = '';
  editDraft = '';

  constructor() {
    effect(() => {
      const notes = this.readAll()[this.lessonId()] ?? [];
      this.notes.set(notes);
      this.countChange.emit(notes.length);
    });
  }

  addNote(): void {
    const body = this.draft.trim();
    if (!body) return;
    this.notes.update(notes => [{ id: `note-${Date.now()}`, body, updatedAt: 'Vừa xong' }, ...notes]);
    this.draft = '';
    this.persist();
  }

  beginEdit(note: LessonNote): void {
    this.editingId.set(note.id);
    this.editDraft = note.body;
  }

  saveEdit(id: string): void {
    const body = this.editDraft.trim();
    if (!body) return;
    this.notes.update(notes => notes.map(note => note.id === id ? { ...note, body, updatedAt: 'Vừa cập nhật' } : note));
    this.editingId.set(null);
    this.persist();
  }

  deleteNote(id: string): void {
    this.notes.update(notes => notes.filter(note => note.id !== id));
    this.persist();
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    // TODO(pre-deploy): Nhớ thay lưu ghi chú local bằng Notes API theo hợp đồng backend chính thức.
    const all = this.readAll();
    all[this.lessonId()] = this.notes();
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
    this.countChange.emit(this.notes().length);
  }

  private readAll(): Record<string, LessonNote[]> {
    if (typeof localStorage === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, LessonNote[]>;
    } catch {
      return {};
    }
  }
}
