import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Decorative scroll-linked paper plane for the public landing page only.
 * Uses native SVG geometry and requestAnimationFrame; no third-party animation dependency.
 */
@Component({
  selector: 'app-landing-flight-trail',
  standalone: true,
  templateUrl: './landing-flight-trail.component.html',
  styleUrl: './landing-flight-trail.component.css',
})
export class LandingFlightTrailComponent implements AfterViewInit, OnDestroy {
  @ViewChild('flightSvg', { static: true }) private flightSvg!: ElementRef<SVGSVGElement>;
  @ViewChild('flightPath', { static: true }) private flightPath!: ElementRef<SVGPathElement>;
  @ViewChild('plane', { static: true }) private plane!: ElementRef<HTMLElement>;

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;
  private mediaQuery?: MediaQueryList;
  private animationFrame = 0;
  private page?: HTMLElement;
  private pathLength = 0;

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    this.page = this.host.nativeElement.parentElement ?? undefined;
    if (!this.page) return;

    this.mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.mediaQuery.addEventListener('change', this.updateMotionPreference);
    this.resizeObserver = new ResizeObserver(this.rebuildRoute);
    this.resizeObserver.observe(this.page);
    window.addEventListener('resize', this.rebuildRoute, { passive: true });
    window.addEventListener('scroll', this.scheduleFrame, { passive: true });
    this.rebuildRoute();
    this.updateMotionPreference();
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    window.removeEventListener('scroll', this.scheduleFrame);
    window.removeEventListener('resize', this.rebuildRoute);
    this.mediaQuery?.removeEventListener('change', this.updateMotionPreference);
    this.resizeObserver?.disconnect();
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
  }

  private readonly updateMotionPreference = (): void => {
    if (!this.plane) return;
    this.plane.nativeElement.hidden = this.mediaQuery?.matches ?? false;
    this.scheduleFrame();
  };

  private readonly rebuildRoute = (): void => {
    if (!this.page) return;
    const width = Math.max(320, this.page.clientWidth);
    const height = Math.max(1, this.page.scrollHeight);

    this.flightSvg.nativeElement.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const sections = Array.from(this.page.querySelectorAll<HTMLElement>('main > section'));
    const pageTop = this.page.getBoundingClientRect().top + window.scrollY;
    const anchors = sections.map((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top + window.scrollY - pageTop + rect.height * 0.58;
    });

    // Keep the route mostly in the side gutters, avoiding central reading areas.
    const left = width < 768 ? width * 0.16 : width * 0.08;
    const right = width < 768 ? width * 0.84 : width * 0.92;
    const ys = [Math.max(100, anchors[0] ?? 120)];
    anchors.slice(1).forEach((y) => {
      if (y > ys[ys.length - 1] + 110) ys.push(y);
    });
    if (height - ys[ys.length - 1] > 140) ys.push(height - 90);

    let d = `M ${right.toFixed(1)} ${ys[0].toFixed(1)}`;
    let previousX = right;
    for (let index = 1; index < ys.length; index++) {
      const nextX = index % 2 === 1 ? left : right;
      const prevY = ys[index - 1];
      const nextY = ys[index];
      const delta = (nextY - prevY) * 0.55;
      d += ` C ${previousX.toFixed(1)} ${(prevY + delta).toFixed(1)}, ${nextX.toFixed(1)} ${(nextY - delta).toFixed(1)}, ${nextX.toFixed(1)} ${nextY.toFixed(1)}`;
      previousX = nextX;
    }

    const path = this.flightPath.nativeElement;
    path.setAttribute('d', d);
    this.pathLength = path.getTotalLength();
    this.scheduleFrame();
  };

  private readonly scheduleFrame = (): void => {
    if (this.animationFrame) return;
    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = 0;
      this.updatePosition();
    });
  };

  private updatePosition(): void {
    if (!this.page || !this.pathLength || this.mediaQuery?.matches) return;
    const pageTop = this.page.getBoundingClientRect().top + window.scrollY;
    const visibleScroll = window.scrollY + window.innerHeight * 0.55 - pageTop;
    const range = Math.max(1, this.page.scrollHeight - window.innerHeight * 0.2);
    const progress = Math.min(1, Math.max(0, visibleScroll / range));
    const path = this.flightPath.nativeElement;
    const location = this.pathLength * progress;
    const point = path.getPointAtLength(location);
    const before = path.getPointAtLength(Math.max(0, location - 2));
    const after = path.getPointAtLength(Math.min(this.pathLength, location + 2));
    const degrees = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    this.plane.nativeElement.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) rotate(${degrees}deg)`;
  }
}
