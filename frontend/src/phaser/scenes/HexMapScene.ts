import * as Phaser from 'phaser';
import { CameraController } from '../CameraController';
import { StoreBridge } from '../StoreBridge';
import { LocationCluster } from '../objects/LocationCluster';
import { AgentSprite } from '../objects/AgentSprite';
import {
  hexToPixel, hexNeighborAt, hexVertices,
  DISPLAY_W, DISPLAY_H, HEX_SCALE,
} from '../../game/world/HexGrid';
import { getTerrain, allTileNumbers, tileKey, tilePath } from '../../game/TerrainGen';
import type { WorldLayout } from '../../game/world/types';

const DRAG_THRESHOLD = 6;

// Owner territory colors (Civ-style)
const OWNER_COLORS = [
  0xc0503a, 0x4a7eb5, 0x4a9e5c, 0xd4a030,
  0x7b5ea7, 0x3a9e9e, 0xc06090, 0x8b5e3c,
];

// Border line color per owner (slightly brighter)
const BORDER_COLORS = [
  0xe06050, 0x6a9ed5, 0x6abe7c, 0xf4c040,
  0x9b7ec7, 0x5abebe, 0xe080b0, 0xab7e5c,
];

export class HexMapScene extends Phaser.Scene {
  public cameraController!: CameraController;
  private bridge!: StoreBridge;

  private locationObjects = new Map<number, LocationCluster>();
  private agentObjects = new Map<number, AgentSprite>();
  private terrainSprites = new Map<string, Phaser.GameObjects.Image>();
  private territoryOverlays = new Map<string, Phaser.GameObjects.Image>();
  private borderGraphics: Phaser.GameObjects.Graphics | null = null;
  private hexOwners = new Map<string, number>();

  constructor() {
    super({ key: 'HexMapScene' });
  }

  preload() {
    // Load all Kenney hex tiles
    for (const num of allTileNumbers()) {
      this.load.image(tileKey(num), tilePath(num));
    }
  }

  create() {
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.generateHexMask();

    this.cameraController = new CameraController(this);
    this.cameraController.centerOnOrigin();

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > DRAG_THRESHOLD) return;
      if (this.input.hitTestPointer(p).length === 0) {
        StoreBridge.selectEntity(null);
      }
    });

    this.bridge = new StoreBridge(this);
  }

  update() {
    this.renderVisibleTerrain();
  }

  /** Generate a white pointy-top hex mask for territory tinting. */
  private generateHexMask() {
    if (this.textures.exists('hex_mask')) return;
    const r = DISPLAY_H * 0.5;
    const gfx = this.add.graphics();
    const verts = hexVertices(DISPLAY_W / 2, DISPLAY_H / 2, r);
    const pts = verts.map(v => new Phaser.Geom.Point(v.x, v.y));
    gfx.fillStyle(0xffffff, 1);
    gfx.fillPoints(pts, true);
    gfx.generateTexture('hex_mask', Math.ceil(DISPLAY_W), Math.ceil(DISPLAY_H));
    gfx.destroy();
  }

  /** Only render hexes that exist on-chain (in hexOwners). */
  private renderVisibleTerrain() {
    this.hexOwners.forEach((ownerId, key) => {
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToPixel(q, r);
      const cx = x + DISPLAY_W / 2;
      const cy = y + DISPLAY_H / 2;

      // Terrain tile
      if (!this.terrainSprites.has(key)) {
        const terrain = getTerrain(q, r);
        if (this.textures.exists(terrain.textureKey)) {
          const sprite = this.add.image(cx, cy, terrain.textureKey);
          sprite.setScale(HEX_SCALE);
          sprite.setDepth(-1);
          this.terrainSprites.set(key, sprite);
        }
      }

      // Territory color overlay — unifies hexes of the same owner into one region
      if (!this.territoryOverlays.has(key) && ownerId > 0) {
        const color = OWNER_COLORS[(ownerId - 1) % OWNER_COLORS.length];
        const overlay = this.add.image(cx, cy, 'hex_mask');
        overlay.setTint(color);
        overlay.setAlpha(0.28);
        overlay.setDepth(0);
        this.territoryOverlays.set(key, overlay);
      }
    });
  }

  updateHexOwners(hexOwners: Map<string, number>) {
    // Remove terrain for hexes no longer on-chain
    this.terrainSprites.forEach((sprite, key) => {
      if (!hexOwners.has(key)) {
        sprite.destroy();
        this.terrainSprites.delete(key);
      }
    });
    // Refresh territory overlays for changed ownership
    this.territoryOverlays.forEach((overlay, key) => {
      if (this.hexOwners.get(key) !== hexOwners.get(key)) {
        overlay.destroy();
        this.territoryOverlays.delete(key);
      }
    });
    this.hexOwners = hexOwners;
    this.drawCultureBorders();
  }

  /** Civ-style culture borders: glowing lines on edges between different owners. */
  private drawCultureBorders() {
    if (this.borderGraphics) this.borderGraphics.destroy();
    this.borderGraphics = this.add.graphics();
    this.borderGraphics.setDepth(0.5);

    const hexR = DISPLAY_H * 0.5;

    this.hexOwners.forEach((ownerId, key) => {
      if (ownerId <= 0) return;

      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToPixel(q, r);
      const cx = x + DISPLAY_W / 2;
      const cy = y + DISPLAY_H / 2;
      const verts = hexVertices(cx, cy, hexR);
      const borderColor = BORDER_COLORS[(ownerId - 1) % BORDER_COLORS.length];

      for (let edge = 0; edge < 6; edge++) {
        const [nq, nr] = hexNeighborAt(q, r, edge);
        const neighborOwner = this.hexOwners.get(`${nq},${nr}`) ?? -1;

        if (neighborOwner !== ownerId) {
          const v1 = verts[edge];
          const v2 = verts[(edge + 1) % 6];

          // Shift line slightly inward
          const shift = 3;
          const d1 = Math.hypot(cx - v1.x, cy - v1.y) || 1;
          const d2 = Math.hypot(cx - v2.x, cy - v2.y) || 1;
          const sx1 = v1.x + (cx - v1.x) * shift / d1;
          const sy1 = v1.y + (cy - v1.y) * shift / d1;
          const sx2 = v2.x + (cx - v2.x) * shift / d2;
          const sy2 = v2.y + (cy - v2.y) * shift / d2;

          // Outer glow
          this.borderGraphics!.lineStyle(8, borderColor, 0.25);
          this.borderGraphics!.lineBetween(sx1, sy1, sx2, sy2);
          // Core line
          this.borderGraphics!.lineStyle(3, borderColor, 0.95);
          this.borderGraphics!.lineBetween(sx1, sy1, sx2, sy2);
        }
      }
    });
  }

  applyLayout(layout: WorldLayout) {
    if (!this.sys?.displayList) return;

    this.updateHexOwners(layout.hexOwners);

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

  shutdown() {
    this.bridge.destroy();
    this.terrainSprites.forEach((s) => s.destroy());
    this.terrainSprites.clear();
    this.territoryOverlays.forEach((o) => o.destroy());
    this.territoryOverlays.clear();
    this.borderGraphics?.destroy();
    this.locationObjects.forEach((o) => o.destroy());
    this.agentObjects.forEach((o) => o.destroy());
    this.locationObjects.clear();
    this.agentObjects.clear();
  }
}
