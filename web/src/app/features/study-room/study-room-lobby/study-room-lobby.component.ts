import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
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
  LucideTag,
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
    LucideTag,
    LucideX,
    LucidePlay,
  ],
  templateUrl: "./study-room-lobby.component.html",
  styleUrl: "./study-room-lobby.component.css",
})
export class StudyRoomLobbyComponent implements OnInit {
  private readonly roomsService = inject(StudyRoomService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
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
  readonly selectedTopics = signal<readonly string[]>([]);
  readonly pendingTopics = signal<readonly string[]>([]);
  readonly isTopicMenuOpen = signal(false);
  readonly topicSearch = signal("");
  readonly selectedTab = signal("trending");
  readonly search = signal("");
  readonly modal = signal<
    "create" | "password" | "full" | "waitlist" | "approval" | "created" | null
  >(null);
  readonly activeRoom = signal<StudyRoomItem | null>(null);
  readonly rooms = this.roomsService.rooms;
  readonly loading = signal(true);
  readonly loadError = signal("");
  readonly visibleTopics = computed(() => {
    const query = this.topicSearch().trim().toLocaleLowerCase("vi");
    return this.topics
      .slice(1)
      .filter(
        (topic) => !query || topic.toLocaleLowerCase("vi").includes(query),
      );
  });
  readonly topicTriggerLabel = computed(() => {
    const topics = this.selectedTopics();
    if (topics.length === 0) return "Chủ đề: Tất cả";
    if (topics.length === 1) return `Chủ đề: ${topics[0]}`;
    return `Chủ đề: ${topics.length} đã chọn`;
  });
  readonly filteredRooms = computed(() => {
    const query = this.search().trim().toLowerCase();
    const topics = this.selectedTopics();
    const tab = this.selectedTab();
    let rooms = this.rooms().filter(
      (room) =>
        room.type !== "private" &&
        (topics.length === 0 ||
          topics.some((topic) =>
            room.tags.some((tag) => tag.toLowerCase() === topic.toLowerCase()),
          )) &&
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
  private pendingJoinCode = "";
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

  ngOnInit(): void {
    this.loadRooms();
  }

  @HostListener("document:click", ["$event"])
  closeTopicMenuOnOutsideClick(event: MouseEvent): void {
    if (
      this.isTopicMenuOpen() &&
      !this.elementRef.nativeElement.contains(event.target as Node)
    )
      this.closeTopicMenu();
  }

  @HostListener("document:keydown.escape")
  closeTopicMenuOnEscape(): void {
    this.closeTopicMenu();
  }

  toggleTopicMenu(): void {
    if (this.isTopicMenuOpen()) {
      this.closeTopicMenu();
      return;
    }
    this.pendingTopics.set([...this.selectedTopics()]);
    this.topicSearch.set("");
    this.isTopicMenuOpen.set(true);
  }

  closeTopicMenu(): void {
    this.isTopicMenuOpen.set(false);
    this.topicSearch.set("");
  }

  togglePendingTopic(topic: string): void {
    const selected = this.pendingTopics();
    this.pendingTopics.set(
      selected.includes(topic)
        ? selected.filter((item) => item !== topic)
        : [...selected, topic],
    );
  }

  clearPendingTopics(): void {
    this.pendingTopics.set([]);
  }

  applyTopicFilter(): void {
    this.selectedTopics.set([...this.pendingTopics()]);
    this.closeTopicMenu();
  }

  resetFilters(): void {
    this.search.set("");
    this.selectedTopics.set([]);
    this.pendingTopics.set([]);
    this.selectedTab.set("trending");
    this.closeTopicMenu();
    this.loadRooms();
  }

  loadRooms(): void {
    this.loading.set(true);
    this.loadError.set("");
    this.roomsService.loadRooms().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.loadError.set("Không thể tải danh sách phòng học.");
      },
    });
  }

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
      this.modal.set("full");
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
    this.attemptJoin(room.roomId);
  }
  joinByCode(): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(["/auth/login"], {
        queryParams: { returnUrl: "/learning/study-room" },
      });
      return;
    }
    if (!this.roomCode.trim()) {
      this.feedback = "Vui lòng nhập mã hoặc link phòng.";
      return;
    }
    this.attemptJoin(this.roomCode.trim(), this.password);
  }
  verifyPassword(): void {
    const room = this.activeRoom();
    const code = room?.roomId || this.pendingJoinCode;
    if (!code) return;
    this.attemptJoin(code, this.password);
  }
  private attemptJoin(codeOrLink: string, password = ""): void {
    this.pendingJoinCode = codeOrLink;
    this.feedback = "";
    this.roomsService.joinRoom(codeOrLink, password).subscribe({
      next: (room) => {
        this.pendingJoinCode = "";
        this.activeRoom.set(room);
        this.modal.set(null);
        void this.router.navigate(["/learning/study-room", room.roomId]);
      },
      error: (error: HttpErrorResponse) => {
        const body = error.error as {
          code?: string;
          message?: string;
          room?: { roomId?: string; name?: string };
        } | null;
        if (body?.code === "PASSWORD_REQUIRED") {
          const room = this.roomsService.getRoomById(
            body.room?.roomId || codeOrLink,
          );
          if (room) this.activeRoom.set(room);
          this.modal.set("password");
        } else if (body?.code === "ROOM_FULL") this.modal.set("full");
        this.feedback =
          body?.message || "Không thể vào phòng. Vui lòng thử lại.";
      },
    });
  }
  createRoom(): void {
    if (this.newRoomName.trim().length < 5) {
      this.feedback = "Tên phòng cần ít nhất 5 ký tự.";
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
    this.roomsService
      .createRoom({
        name: this.newRoomName.trim(),
        goal: this.newRoomDescription.trim(),
        type: this.newRoomMode === "open" ? "public" : "private",
        capacity: Number(this.newRoomLimit),
        tags: [
          this.newRoomTopic,
          ...this.newRoomTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ],
        topic: this.newRoomTopic,
        roomTheme: this.newRoomTheme,
        creatorName: this.auth.currentUser()?.full_name || "Tôi",
        password:
          this.newRoomMode === "password" ? this.newRoomPassword : undefined,
      })
      .subscribe({
        next: (room) => {
          this.activeRoom.set(room);
          this.feedback = "";
          this.modal.set("created");
        },
        error: (error: HttpErrorResponse) => {
          this.feedback =
            (error.error as { message?: string } | null)?.message ||
            "Không thể tạo phòng. Vui lòng thử lại.";
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
  submitJoinRequest(): void {
    const room = this.activeRoom();
    const user = this.auth.currentUser();
    if (!room || !user) return;
    this.roomsService
      .requestJoin(room.roomId, user.id, user.full_name)
      .subscribe({
        next: (response) => {
          this.feedback = response.message;
          this.modal.set(null);
        },
        error: (error: HttpErrorResponse) => {
          this.feedback =
            (error.error as { message?: string } | null)?.message ||
            "Không thể gửi yêu cầu vào phòng.";
        },
      });
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
          "/assets/study-room/lobby-hero-poster.webp";
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
