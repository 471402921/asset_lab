const ALLOWED_ZOOMS = [2, 3, 4, 6, 8];
const DEFAULT_ZOOM = 4;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.zoom = DEFAULT_ZOOM;
  }

  setZoom(level) {
    if (!ALLOWED_ZOOMS.includes(level)) {
      console.warn(
        `[renderer] zoom ${level} 非法 (仅允许 ${ALLOWED_ZOOMS.join('/')}), 保留旧值 ${this.zoom}`
      );
      return false;
    }
    this.zoom = level;
    return true;
  }

  zoomStep(direction) {
    const idx = ALLOWED_ZOOMS.indexOf(this.zoom);
    const next =
      ALLOWED_ZOOMS[Math.max(0, Math.min(ALLOWED_ZOOMS.length - 1, idx + direction))];
    return this.setZoom(next);
  }

  resetZoom() {
    return this.setZoom(DEFAULT_ZOOM);
  }

  clear(color = '#1a1a1a') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;
  }

  drawBackground(img) {
    if (!img) return;
    this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
  }

  drawEntity(img, x, y, customZoom = null) {
    if (!img) return;
    const z = customZoom ?? this.zoom;
    this.ctx.drawImage(img, x, y, img.naturalWidth * z, img.naturalHeight * z);
  }

  drawCenteredEntity(img, customZoom = null) {
    if (!img) return;
    const z = customZoom ?? this.zoom;
    const w = img.naturalWidth * z;
    const h = img.naturalHeight * z;
    const x = (this.canvas.width - w) / 2;
    const y = (this.canvas.height - h) / 2;
    this.ctx.drawImage(img, x, y, w, h);
  }
}
