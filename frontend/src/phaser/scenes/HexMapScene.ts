import * as Phaser from 'phaser';
import { CameraController } from '../CameraController';
import { StoreBridge } from '../StoreBridge';
import { LocationCluster } from '../objects/LocationCluster';
import { AgentSprite } from '../objects/AgentSprite';
import { hexToPixel, TILE_W, TILE_H, inBounds, MAP_RADIUS, hexRing } from '../../game/world/HexGrid';
import { getTerrain } from '../../game/TerrainGen';
import { generateAllTextures } from '../CartoonTextures';
import type { WorldLayout } from '../../game/world/types';

const DRAG_THRESHOLD = 6;
const VIEW_PAD = 3;

/** Pointy-top hex step sizes in pixels. */
const Q_STEP_X = TILE_W;        // 120
const R_STEP_X = TILE_W / 2;    // 60
const R_STEP_Y = TILE_H * 0.75; // 105

// Owner territory colors — must match LocationCluster's OWNER_COLORS
const OWNER_COLORS = [
  0xc0503a, 0x4a7eb5, 0x4a9e5c, 0xd4a030,
  0x7b5ea7, 0x3a9e9e, 0xc06090, 0x8b5e3c,
];

export class HexMapScene extends Phaser.Scene {
  public cameraController!: CameraController;
  private bridge!: StoreBridge;

  private locationObjects = new Map<number, LocationCluster>();
  private agentObjects = new Map<number, AgentSprite>();
  private terrainSprites = new Map<string, Phaser.GameObjects.Image>();
  private ownerOverlays = new Map<string, Phaser.GameObjects.Graphics>();
  private hexOwners = new Map<string, number>();

  constructor() {
    super({ key: 'HexMapScene' });
  }

  preload() {
    // No file loading needed — textures are generated procedurally
  }

  create() {
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Generate all cartoon textures procedurally
    generateAllTextures(this);

    this.cameraController = new CameraController(this);
    this.cameraController.centerOnOrigin();

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > DRAG_THRESHOLD) return;
      if (this.input.hitTestPointer(p).length === 0) {
        StoreBridge.selectEntity(null);
      }
    });

    // Draw world boundary ring
    this.drawBoundary();

    this.bridge = new StoreBridge(this);
  }

  update() {
    this.renderVisibleTerrain();
  }

  private renderVisibleTerrain() {
    const wv = this.cameras.main.worldView;
    const left = wv.x - TILE_W;
    const right = wv.x + wv.width + TILE_W;
    const top = wv.y - TILE_H;
    const bottom = wv.y + wv.height + TILE_H;

    const rMin = Math.floor(top / R_STEP_Y) - VIEW_PAD;
    const rMax = Math.ceil(bottom / R_STEP_Y) + VIEW_PAD;
    const qMin = Math.floor((left - rMax * R_STEP_X) / Q_STEP_X) - VIEW_PAD;
    const qMax = Math.ceil((right - rMin * R_STEP_X) / Q_STEP_X) + VIEW_PAD;

    const visible = new Set<string>();

    for (let r = rMin; r <= rMax; r++) {
      for (let q = qMin; q <= qMax; q++) {
        const { x, y } = hexToPixel(q, r);

        if (x < left || x > right || y < top || y > bottom) continue;

        const key = `${q},${r}`;
        visible.add(key);

        // Only render terrain inside world boundary
        if (!inBounds(q, r)) continue;

        if (!this.terrainSprites.has(key)) {
          const terrain = getTerrain(q, r);
          const sprite = this.add.image(Math.round(x), Math.round(y), terrain.textureKey);
          sprite.setScale(1.01);
          sprite.setDepth(-1);
          this.terrainSprites.set(key, sprite);
        }

        // Owner territory overlay
        const ownerId = this.hexOwners.get(key);
        if (ownerId && !this.ownerOverlays.has(key)) {
          const color = OWNER_COLORS[(ownerId - 1) % OWNER_COLORS.length];
          const gfx = this.add.graphics();
          gfx.fillStyle(color, 0.3);
          const pts = this.hexPoints(Math.round(x), Math.round(y), TILE_H * 0.5);
          gfx.fillPoints(pts, true);
          gfx.lineStyle(2.5, color, 0.6);
          gfx.strokePoints(pts, true);
          gfx.setDepth(0);
          this.ownerOverlays.set(key, gfx);
        }
      }
    }

    // Cleanup off-screen terrain
    this.terrainSprites.forEach((sprite, key) => {
      if (!visible.has(key)) {
        sprite.destroy();
        this.terrainSprites.delete(key);
      }
    });

    // Cleanup off-screen overlays
    this.ownerOverlays.forEach((gfx, key) => {
      if (!visible.has(key)) {
        gfx.destroy();
        this.ownerOverlays.delete(key);
      }
    });
  }

  /** Update hex ownership data and refresh overlays */
  updateHexOwners(hexOwners: Map<string, number>) {
    this.hexOwners = hexOwners;
    // Clear all existing overlays so they get recreated with correct colors
    this.ownerOverlays.forEach((gfx) => gfx.destroy());
    this.ownerOverlays.clear();
  }

  applyLayout(layout: WorldLayout) {
    if (!this.sys?.displayList) return;

    // Update hex ownership
    this.updateHexOwners(layout.hexOwners);

    // Rebuild all location clusters (owner/data may have changed)
    this.locationObjects.forEach((obj) => obj.destroy());
    this.locationObjects.clear();
    for (const loc of layout.locations) {
      this.locationObjects.set(loc.id, new LocationCluster(this, loc));
    }

    const activeAgentIds = new Set(layout.agents.map((a) => a.id));
    this.agentObjects.forEach((obj, id) => {
      if (!activeAgentIds.has(id)) { obj.destroy(); this.agentObjects.delete(id); }
    });
    for (const agent of layout.agents) {
      const sprite = this.agentObjects.get(agent.id);
      if (!sprite) {
        this.agentObjects.set(agent.id, new AgentSprite(this, agent));
      } else {
        sprite.updatePosition(agent);
      }
    }
  }

  highlightEntity(entity: { type: string; id: number } | null) {
    if (!this.sys?.displayList) return;
    this.agentObjects.forEach((sprite, id) => {
      sprite.setSelected(entity?.type === 'agent' && id === entity.id);
    });
    this.locationObjects.forEach((cluster, id) => {
      cluster.setSelected(entity?.type === 'location' && id === entity.id);
    });
  }

  /** Draw the world boundary as a visible hex outline at MAP_RADIUS+0.5 */
  private drawBoundary() {
    const gfx = this.add.graphics();
    gfx.setDepth(0.5);

    // Draw faded hex outlines on the boundary ring (radius = MAP_RADIUS)
    const ring = hexRing(0, 0, MAP_RADIUS);
    for (const [q, r] of ring) {
      const { x, y } = hexToPixel(q, r);
      const pts = this.hexPoints(Math.round(x), Math.round(y), TILE_H * 0.5);
      gfx.lineStyle(2, 0x8b5e3c, 0.4);
      gfx.strokePoints(pts, true);
    }

    // Draw a thicker outline just outside the boundary
    const outerRing = hexRing(0, 0, MAP_RADIUS + 1);
    for (const [q, r] of outerRing) {
      const { x, y } = hexToPixel(q, r);
      // Dim "void" markers outside boundary
      gfx.fillStyle(0x1a1408, 0.6);
      const pts = this.hexPoints(Math.round(x), Math.round(y), TILE_H * 0.48);
      gfx.fillPoints(pts, true);
      gfx.lineStyle(3, 0x5c3a1e, 0.5);
      gfx.strokePoints(this.hexPoints(Math.round(x), Math.round(y), TILE_H * 0.5), true);
    }
  }

  /** Pointy-top hex vertices */
  private hexPoints(cx: number, cy: number, radius: number): Phaser.Geom.Point[] {
    const pts: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push(new Phaser.Geom.Point(
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
      ));
    }
    return pts;
  }

  shutdown() {
    this.bridge.destroy();
    this.terrainSprites.forEach((s) => s.destroy());
    this.terrainSprites.clear();
    this.ownerOverlays.forEach((g) => g.destroy());
    this.ownerOverlays.clear();
    this.locationObjects.forEach((o) => o.destroy());
    this.agentObjects.forEach((o) => o.destroy());
    this.locationObjects.clear();
    this.agentObjects.clear();
  }
}
