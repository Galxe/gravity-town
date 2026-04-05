import * as Phaser from 'phaser';
import { CameraController } from '../CameraController';
import { StoreBridge } from '../StoreBridge';
import { LocationCluster } from '../objects/LocationCluster';
import { AgentSprite } from '../objects/AgentSprite';
import { hexToPixel, TILE_W, TILE_H, MAP_RADIUS, hexRing } from '../../game/world/HexGrid';
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
  private gridLines = new Map<string, Phaser.GameObjects.Graphics>();
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

    // 1. Grid lines: viewport-culled, infinite background
    const visible = new Set<string>();
    for (let r = rMin; r <= rMax; r++) {
      for (let q = qMin; q <= qMax; q++) {
        const { x, y } = hexToPixel(q, r);
        if (x < left || x > right || y < top || y > bottom) continue;
        const key = `${q},${r}`;
        visible.add(key);
        if (!this.gridLines.has(key)) {
          const g = this.add.graphics();
          g.lineStyle(1.5, 0x8b5e3c, 0.25);
          g.strokePoints(this.hexPoints(Math.round(x), Math.round(y), TILE_H * 0.5), true);
          g.setDepth(-2);
          this.gridLines.set(key, g);
        }
      }
    }
    this.gridLines.forEach((gfx, key) => {
      if (!visible.has(key)) { gfx.destroy(); this.gridLines.delete(key); }
    });

    // 2. All hexes: always rendered (few total), never viewport-culled
    this.hexOwners.forEach((ownerId, key) => {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToPixel(q, r);

      if (!this.terrainSprites.has(key)) {
        const terrain = getTerrain(q, r);
        const sprite = this.add.image(Math.round(x), Math.round(y), terrain.textureKey);
        sprite.setScale(1.01);
        sprite.setDepth(-1);
        this.terrainSprites.set(key, sprite);
      }

      if (!this.ownerOverlays.has(key)) {
        const gfx = this.add.graphics();
        const pts = this.hexPoints(Math.round(x), Math.round(y), TILE_H * 0.5);
        if (ownerId > 0) {
          const color = OWNER_COLORS[(ownerId - 1) % OWNER_COLORS.length];
          gfx.fillStyle(color, 0.3);
          gfx.fillPoints(pts, true);
          gfx.lineStyle(2.5, color, 0.6);
          gfx.strokePoints(pts, true);
        } else {
          // Neutral/rebelled hex — dim outline
          gfx.fillStyle(0x555555, 0.15);
          gfx.fillPoints(pts, true);
          gfx.lineStyle(1.5, 0x888888, 0.3);
          gfx.strokePoints(pts, true);
        }
        gfx.setDepth(0);
        this.ownerOverlays.set(key, gfx);
      }
    });
  }

  /** Update hex ownership data and refresh visuals for changed hexes */
  updateHexOwners(hexOwners: Map<string, number>) {
    // Only touch hexes whose ownership actually changed
    this.terrainSprites.forEach((sprite, key) => {
      if (this.hexOwners.get(key) && !hexOwners.has(key)) {
        sprite.destroy(); this.terrainSprites.delete(key);
      }
    });
    this.ownerOverlays.forEach((gfx, key) => {
      if (this.hexOwners.get(key) !== hexOwners.get(key)) {
        gfx.destroy(); this.ownerOverlays.delete(key);
      }
    });
    this.hexOwners = hexOwners;
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

  /** Draw world boundary markers just outside MAP_RADIUS */
  private drawBoundary() {
    const gfx = this.add.graphics();
    gfx.setDepth(0.5);

    const outerRing = hexRing(0, 0, MAP_RADIUS + 1);
    for (const [q, r] of outerRing) {
      const { x, y } = hexToPixel(q, r);
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
    this.gridLines.forEach((g) => g.destroy());
    this.gridLines.clear();
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
