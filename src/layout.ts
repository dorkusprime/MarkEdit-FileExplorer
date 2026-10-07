/**
 * Makes room for the explorer beside the editor without fighting other panels.
 *
 * MarkEdit lays the editor + preview out inside <body>, so side panels shrink
 * the body (width + margin-left) and set MarkEdit-preview's
 * `--markedit-content-inset` for pure preview mode. The Outline Sidebar
 * extension does this too, but writes the body styles wholesale (clearing the
 * other side's margin), so two panels would clobber each other. Instead we
 * observe its panel and body writes and re-apply the *combined* insets.
 */

interface PeerPanel {
  side: 'left' | 'right';
  width: number;
}

/** Outline Sidebar (`.meo-sidebar`), if installed and open. */
function outlinePanel(): PeerPanel | undefined {
  const el = document.querySelector<HTMLElement>('.meo-sidebar');
  if (!el?.classList.contains('meo-open')) {
    return undefined;
  }
  // offsetWidth ignores the slide-in transform; the class marks a left dock.
  const side = document.documentElement.classList.contains('meo-push-left') ? 'left' : 'right';
  return { side, width: el.offsetWidth };
}

export class Layout {
  private width = 0;
  private side: 'left' | 'right' = 'left';
  private active = false;
  private observer: MutationObserver;
  private applying = false;
  private scheduled = false;

  constructor(private panel: HTMLElement) {
    this.observer = new MutationObserver(() => this.schedule());
  }

  start(): void {
    this.observer.observe(document.body, { attributes: true, attributeFilter: ['style'], childList: true });
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', () => this.schedule());
  }

  /** Open with the given width/side, or pass width 0 to give the space back. */
  set(width: number, side: 'left' | 'right'): void {
    this.width = width;
    this.side = side;
    this.active = width > 0;
    this.apply();
  }

  /** Peer panels can change size/visibility with transitions; settle after them. */
  private schedule(): void {
    if (this.applying || this.scheduled) {
      return;
    }
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.apply();
    });
  }

  private apply(): void {
    this.applying = true;
    try {
      const peer = outlinePanel();
      const body = document.body.style;
      const root = document.documentElement;
      const mine = this.active ? this.width : 0;
      const left = (this.side === 'left' ? mine : 0) + (peer?.side === 'left' ? peer.width : 0);
      const right = (this.side === 'right' ? mine : 0) + (peer?.side === 'right' ? peer.width : 0);

      // Sit beside (not under) a peer docked on the same side.
      const offset = peer?.side === this.side ? peer.width : 0;
      this.panel.style.left = this.side === 'left' ? `${offset}px` : '';
      this.panel.style.right = this.side === 'right' ? `${offset}px` : '';

      if (!this.active) {
        // Leave a peer's own layout untouched; just remove our contribution.
        root.classList.remove('mfe-push');
        if (peer === undefined && root.dataset.mfeOwned === '1') {
          body.width = '';
          body.marginLeft = '';
          body.marginRight = '';
          root.style.removeProperty('--markedit-content-inset');
        } else if (peer !== undefined && root.dataset.mfeOwned === '1') {
          this.write(left, right);
        }
        delete root.dataset.mfeOwned;
        return;
      }

      root.dataset.mfeOwned = '1';
      this.write(left, right);
      // MarkEdit's active-line layer assumes the editor starts at x=0; shift it
      // back by the total left inset (overrides Outline Sidebar's own rule).
      root.style.setProperty('--mfe-left-inset', `${left}px`);
      root.classList.toggle('mfe-push', left > 0);
    } finally {
      // Let our own mutation records flush before listening again.
      queueMicrotask(() => (this.applying = false));
    }
  }

  private write(left: number, right: number): void {
    const body = document.body.style;
    const width = left + right > 0 ? `calc(100vw - ${left + right}px)` : '';
    const marginLeft = left > 0 ? `${left}px` : '';
    if (body.width !== width) body.width = width;
    if (body.marginLeft !== marginLeft) body.marginLeft = marginLeft;
    if (body.marginRight !== '') body.marginRight = '';
    const inset = `0 ${right}px 0 ${left}px`;
    if (document.documentElement.style.getPropertyValue('--markedit-content-inset') !== inset) {
      document.documentElement.style.setProperty('--markedit-content-inset', inset);
    }
  }
}
