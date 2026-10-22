import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../../../core/services/auth.service";
import { StudyRoomItem } from "../models/study-room.model";
import { StudyRoomService } from "../services/study-room.service";
import { PIXEL_DREAMLAND_MEDIA } from "../data/study-room-media";
import {
  LucideArrowRight,
  LucideChevronLeft,
  LucideChevronRight,
  LucideEye,
  LucideLogIn,
  LucidePlus,
  LucideRotateCcw,
  LucideSearch,
  LucideSparkles,
  LucideX,
  LucidePlay,
} from "@lucide/angular";
import {
  StudyRoomCardComponent,
  StudyRoomCardViewModel,
} from "../components/study-room-card/study-room-card.component";

interface ThemePreview {
  id: string;
  name: string;
  src: string;
  type?: "video";
}

@Component({
  selector: "app-study-room-lobby",
  standalone: true,
  imports: [
    FormsModule,
    StudyRoomCardComponent,
    LucideArrowRight,
    LucideChevronLeft,
    LucideChevronRight,
    LucideEye,
    LucideLogIn,
    LucidePlus,
    LucideRotateCcw,
    LucideSearch,
    LucideSparkles,
    LucideX,
    LucidePlay,
  ],
  templateUrl: "./study-room-lobby.component.html",
  styleUrl: "./study-room-lobby.component.css",
})
export class StudyRoomLobbyComponent {
  private readonly roomsService = inject(StudyRoomService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly topics = [
    "Tất cả",
    "Lập trình",
    "UI/UX & Thiết kế",
    "TOEIC / IELTS",
    "Tự học",
    "Focus Session",
    "Study Group",
  ];
  readonly tabs = [
    { key: "trending", label: "Trending" },
    { key: "new", label: "Mới mở" },
    { key: "active", label: "Đang hoạt động" },
    { key: "available", label: "Còn chỗ" },
  ];
  readonly previews: ThemePreview[] = [
    {
      id: "lofi-night",
      name: "Lofi Night",
      src: "https://i.pinimg.com/originals/55/fc/4b/55fc4bee7c31f0850262da53fa1e3180.gif",
    },
    {
      id: "sky-room",
      name: "Sky Room",
      src: "https://i.pinimg.com/originals/05/3e/50/053e50e89442c41be8b9f10df1c1250f.gif",
    },
    {
      id: "cloud-window",
      name: "Cloud Window",
      src: "https://i.pinimg.com/originals/9a/a3/5e/9aa35edded370761aff4065510146b56.gif",
    },
    {
      id: "cozy-window",
      name: "Cozy Window",
      src: "https://i.pinimg.com/originals/41/f7/72/41f7728ec0b73ee02e86cad71292f90b.gif",
    },
    {
      id: "pragmata-horizon",
      name: "Pragmata Horizon",
      type: "video",
      src: "https://motionbgs.com/media/9514/pragmata-horizon.960x540.mp4",
    },
    {
      id: "thinkup-clean",
      name: "ThinkUp Clean",
      src: "/assets/study-room/lobby-background-clean.png",
    },
    {
      id: "anime-room",
      name: "Anime Room",
      type: "video",
      src: "/assets/study-room/lobby-hero-reference.webm",
    },
    {
      id: "cozy-rainy-window",
      name: "Cửa sổ mưa lofi",
      src: "https://i.pinimg.com/originals/cc/95/db/cc95db51995bf889d8f2217955c2ec1e.gif",
    },
    {
      id: "cherry-blossom-tree",
      name: "Cherry Blossom Tree",
      type: "video",
      src: "https://motionbgs.com/media/9121/large-cherry-blossom-tree.960x540.mp4",
    },
  ];
  readonly roomThemes = [
    { id: "white", name: "Trắng mặc định" },
    { id: "minimal", name: "Minimal" },
    { id: "coffee", name: "Coffee Shop" },
    { id: "library", name: "Library" },
    { id: "night", name: "Night Owl" },
    { id: "nature", name: "Zen Garden" },
    { id: "space", name: "Space Lab" },
    ...this.previews,
    {
      id: "pixel-dreamland",
      name: "Pixel Dreamland",
      src: PIXEL_DREAMLAND_MEDIA,
    },
    { id: "genshin-impact", name: "Genshin Impact" },
  ];
  readonly previewPage = signal(0);
  readonly visiblePreviews = computed(() =>
    this.previews.slice(this.previewPage() * 3, this.previewPage() * 3 + 3),
  );
  readonly selectedTopic = signal("Tất cả");
  readonly selectedTab = signal("trending");
  readonly search = signal("");
  readonly modal = signal<
    "create" | "password" | "full" | "waitlist" | "approval" | "created" | null
  >(null);
  readonly activeRoom = signal<StudyRoomItem | null>(null);
  readonly rooms = this.roomsService.rooms;
  readonly filteredRooms = computed(() => {
    const query = this.search().trim().toLowerCase();
    const topic = this.selectedTopic();
    const tab = this.selectedTab();
    let rooms = this.rooms().filter(
      (room) =>
        room.type !== "private" &&
        (topic === "Tất cả" ||
          room.tags.some((tag) => tag.toLowerCase() === topic.toLowerCase())) &&
        (!query ||
          [room.name, room.description, ...room.tags].some((value) =>
            value.toLowerCase().includes(query),
          )) &&
        (tab !== "available" || room.currentUsers < room.maxUsers) &&
        (tab !== "active" ||
          room.status === "focus" ||
          room.status === "break"),
    );
    if (tab === "new")
      rooms = [...rooms].sort((a, b) => b.roomId.localeCompare(a.roomId));
    if (tab === "trending")
      rooms = [...rooms].sort((a, b) => b.currentUsers - a.currentUsers);
    return rooms;
  });
  readonly roomCards = computed<StudyRoomCardViewModel[]>(() =>
    this.filteredRooms().map((room) => ({
      room,
      themeName: this.themeName(room.theme),
      themeBackground: this.themeBackground(room.theme),
      mediaType: this.isVideoTheme(room.theme)
        ? "video"
        : this.hasThemeImage(room.theme)
          ? "image"
          : null,
      mediaSrc: this.isVideoTheme(room.theme)
        ? this.themeVideo(room.theme)
        : this.hasThemeImage(room.theme)
          ? this.themeImage(room.theme)
          : "",
    })),
  );
  roomCode = "";
  password = "";
  feedback = "";
  newRoomName = "";
  newRoomDescription = "";
  newRoomTags = "";
  newRoomTopic = "Lập trình";
  newRoomTheme = "white";
  newRoomPassword = "";
  newRoomMode: "open" | "password" = "open";
  newRoomLimit = 20;

  setPreviewPage(direction: number): void {
    this.previewPage.set((this.previewPage() + direction + 3) % 3);
  }
  selectTheme(theme: ThemePreview): void {
    this.newRoomTheme = theme.id;
    this.openCreate();
  }
  openCreate(): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(["/auth/login"], {
        queryParams: { returnUrl: "/learning/study-room" },
      });
      return;
    }
    this.feedback = "";
    this.modal.set("create");
  }
  quickJoin(): void {
    const room = this.rooms().find(
      (item) => item.type === "public" && item.currentUsers < item.maxUsers,
    );
    if (room) this.joinRoom(room);
    else this.feedback = "Hiện chưa có phòng phù hợp và còn chỗ.";
  }
  joinRoom(room: StudyRoomItem): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(["/auth/login"], {
        queryParams: { returnUrl: "/learning/study-room/" + room.roomId },
      });
      return;
    }
    this.activeRoom.set(room);
    if (room.currentUsers >= room.maxUsers) {
      this.modal.set("waitlist");
      return;
    }
    if (room.inviteMode === "approval" || room.approvalRequired) {
      this.modal.set("approval");
      return;
    }
    if (room.type === "private") {
      this.password = "";
      this.feedback = "";
      this.modal.set("password");
      return;
    }
    this.router.navigate(["/learning/study-room", room.roomId]);
  }
  joinByCode(): void {
    const code = this.roomCode
      .trim()
      .split("/")
      .filter(Boolean)
      .pop()
      ?.toLowerCase();
    const room = this.rooms().find(
      (item) => item.roomId.toLowerCase() === code,
    );
    if (!room) {
      this.feedback = "Không tìm thấy phòng với mã này.";
      return;
    }
    this.feedback = "";
    this.joinRoom(room);
  }
  verifyPassword(): void {
    const room = this.activeRoom();
    if (!room) return;
    if (room.password && room.password !== this.password) {
      this.feedback = "Mật khẩu không đúng.";
      return;
    }
    this.modal.set(null);
    this.router.navigate(["/learning/study-room", room.roomId]);
  }
  createRoom(): void {
    if (this.newRoomName.trim().length < 2) {
      this.feedback = "Tên phòng cần ít nhất 2 ký tự.";
      return;
    }
    if (this.newRoomMode === "password" && this.newRoomPassword.length < 4) {
      this.feedback = "Mật khẩu cần ít nhất 4 ký tự.";
      return;
    }
    if (
      !Number.isInteger(Number(this.newRoomLimit)) ||
      Number(this.newRoomLimit) < 2 ||
      Number(this.newRoomLimit) > 100
    ) {
      this.feedback = "Sức chứa phải từ 2 đến 100 người.";
      return;
    }
    this.roomsService.createRoom({
      name: this.newRoomName.trim(),
      goal: this.newRoomDescription.trim(),
      topic: this.newRoomTopic,
      type: this.newRoomMode === "open" ? "public" : "private",
      capacity: Number(this.newRoomLimit),
      tags: [
        this.newRoomTopic,
        ...this.newRoomTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ],
      roomTheme: this.newRoomTheme,
      creatorName: this.auth.currentUser()?.full_name || "Tôi",
      password:
        this.newRoomMode === "password" ? this.newRoomPassword : undefined,
    }).subscribe({
      next: room => {
        this.activeRoom.set(room);
        this.feedback = "";
        this.modal.set("created");
      },
      error: () => {
        this.feedback = "Không thể tạo phòng lúc này. Vui lòng thử lại.";
      },
    });
  }
  enterCreatedRoom(): void {
    const room = this.activeRoom();
    if (room) {
      sessionStorage.setItem("study_room_theme", room.theme);
      this.router.navigate(["/learning/study-room", room.roomId]);
    }
  }
  // TODO(pre-deploy): Nhớ xóa phản hồi duyệt/chờ mock này khi thay bằng API yêu cầu vào phòng và hàng chờ.
  submitJoinRequest(): void {
    this.feedback =
      this.modal() === "approval"
        ? "Đã gửi yêu cầu vào phòng. Chủ phòng sẽ duyệt bạn."
        : "Đã thêm bạn vào danh sách chờ.";
    this.modal.set(null);
  }
  async copyRoom(room: StudyRoomItem, link = false): Promise<void> {
    await navigator.clipboard.writeText(
      link
        ? `${location.origin}/learning/study-room/${room.roomId}`
        : room.roomId,
    );
    this.feedback = link ? "Đã sao chép link mời." : "Đã sao chép mã phòng.";
  }
  themeImage(theme: string): string {
    return theme === "pixel-dreamland"
      ? PIXEL_DREAMLAND_MEDIA
      : this.previews.find((preview) => preview.id === theme)?.src ||
          "/assets/study-room/lobby-hero-reference.gif";
  }
  themeBackground(theme: string): string {
    const backgrounds: Record<string, string> = {
      white: "#ffffff",
      minimal: "linear-gradient(135deg,#f8fafc,#e0f2fe 48%,#fefce8)",
      coffee: "linear-gradient(135deg,#fff7ed,#fed7aa 42%,#bae6fd)",
      library: "linear-gradient(135deg,#f5f3ff,#ddd6fe 46%,#fef3c7)",
      night: "radial-gradient(circle at top left,#1e3a8a,#0f172a 38%,#111827)",
      nature: "linear-gradient(135deg,#ecfccb,#bbf7d0 44%,#bae6fd)",
      space: "radial-gradient(circle at 20% 20%,#4338ca,#111827 36%,#020617)",
      "thinkup-clean":
        "url('/assets/study-room/lobby-background-clean.png') center / cover",
      "pixel-dreamland": "#2a1238",
      "genshin-impact": "#0f172a",
      "pragmata-horizon": "#07111f",
    };
    return backgrounds[theme] || "#ffffff";
  }
  hasThemeImage(theme: string): boolean {
    return (
      theme === "pixel-dreamland" ||
      this.previews.some(
        (preview) =>
          preview.id === theme &&
          preview.type !== "video" &&
          theme !== "thinkup-clean",
      )
    );
  }
  isVideoTheme(theme: string): boolean {
    return (
      theme === "genshin-impact" ||
      this.previews.some(
        (preview) => preview.id === theme && preview.type === "video",
      )
    );
  }
  themeVideo(theme: string): string {
    return theme === "genshin-impact"
      ? "https://genshin.hoyoverse.com/_nuxt/videos/bg.3e78e80.mp4"
      : this.previews.find((preview) => preview.id === theme)?.src || "";
  }
  themeName(theme: string): string {
    const names: Record<string, string> = {
      white: "Trắng mặc định",
      minimal: "Minimal",
      coffee: "Coffee Shop",
      library: "Library",
      night: "Night Owl",
      nature: "Zen Garden",
      space: "Space Lab",
      "pixel-dreamland": "Pixel Dreamland",
      "genshin-impact": "Genshin Impact",
    };
    return (
      this.previews.find((preview) => preview.id === theme)?.name ||
      names[theme] ||
      theme
    );
  }
}
