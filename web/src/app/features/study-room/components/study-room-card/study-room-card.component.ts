import { Component, input, output } from "@angular/core";
import {
  LucideArrowRight,
  LucideCopy,
  LucideTag,
  LucideUserPlus,
  LucideUsers,
} from "@lucide/angular";
import { StudyRoomItem } from "../../models/study-room.model";

export interface StudyRoomCardViewModel {
  room: StudyRoomItem;
  themeName: string;
  themeBackground: string;
  mediaType: "image" | "video" | null;
  mediaSrc: string;
}

@Component({
  selector: "app-study-room-card",
  standalone: true,
  imports: [
    LucideArrowRight,
    LucideCopy,
    LucideTag,
    LucideUserPlus,
    LucideUsers,
  ],
  templateUrl: "./study-room-card.component.html",
  styleUrl: "./study-room-card.component.css",
})
export class StudyRoomCardComponent {
  readonly item = input.required<StudyRoomCardViewModel>();
  readonly join = output<StudyRoomItem>();
  readonly copyCode = output<StudyRoomItem>();
  readonly copyInvite = output<StudyRoomItem>();
}
