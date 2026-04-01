import type { FocusTarget } from '../store/useGameStore';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;
const FLY_DURATION = 600;

/**
 * Camera drag-to-pan + scroll-to-zoom + animated fly-to.
 * Uses SCREEN-SPACE coordinates to avoid worldX feedback loop.
 */
export class CameraController {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private lastPointer: { x: number; y: number } | null = null;

  constructor(private scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    this.cam.setZoom(1.5);

    // --- Drag to pan (screen-space) ---
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastPointer = { x: p.x, y: p.y };
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.lastPointer) return;
      const dx = p.x - this.lastPointer.x;
      const dy = p.y - this.lastPointer.y;
      // Convert screen delta to world delta (divide by zoom)
      this.cam.scrollX -= dx / this.cam.zoom;
      this.cam.scrollY -= dy / this.cam.zoom;
      this.lastPointer = { x: p.x, y: p.y };
    });

    scene.input.on('pointerup', () => {
      this.lastPointer = null;
    });

    // --- Scroll to zoom ---
    scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _go: unknown[], _dx: number, dy: number) => {
      this.cam.setZoom(Phaser.Math.Clamp(
        this.cam.zoom - Math.sign(dy) * ZOOM_STEP,
        ZOOM_MIN, ZOOM_MAX,
      ));
    });
  }

  flyTo(target: FocusTarget) {
    const zoomLevel = target.zoom === 'close' ? 2.5 : 1.5;
    this.cam.pan(target.x, target.y, FLY_DURATION, 'Sine.easeInOut');
    this.cam.zoomTo(zoomLevel, FLY_DURATION, 'Sine.easeInOut');
  }

  centerOnOrigin() {
    this.cam.centerOn(0, 0);
  }
}
