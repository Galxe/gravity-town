import * as Phaser from 'phaser';
import { CameraController } from '../CameraController';
import { StoreBridge } from '../StoreBridge';
import { LocationCluster } from '../objects/LocationCluster';
import { AgentSprite, allMeepleTextureKeys } from '../objects/AgentSprite';
import { hexToPixel, TILE_W, TILE_H } from '../../game/world/HexGrid';
import { allTerrainTextureKeys, getTerrain } from '../../game/TerrainGen';
import { allBuildingTextureKeys } from '../../game/BuildingTags';
import type { WorldLayout } from '../../game/world/types';

const DRAG_THRESHOLD = 6;
const VIEW_PAD = 3;

/** Pointy-top hex step sizes in pixels. */
const Q_STEP_X = TILE_W;        // 120
const R_STEP_X = TILE_W / 2;    // 60
const R_STEP_Y = TILE_H * 0.75; // 105

export class HexMapScene extends Phaser.Scene {
  public cameraController!: CameraController;
  private bridge!: StoreBridge;

  private locationObjects = new Map<number, LocationCluster>();
  private agentObjects = new Map<number, AgentSprite>();
  private terrainSprites = new Map<string, Phaser.GameObjects.Image>();

  constructor() {
    super({ key: 'HexMapScene' });
  }

  preload() {
    for (const { key, file } of allTerrainTextureKeys()) {
      this.load.image(key, file);
    }
    for (const { key, file } of allBuildingTextureKeys()) {
      this.load.image(key, file);
    }
    for (const { key, file } of allMeepleTextureKeys()) {
      this.load.image(key, file);
    }
  }

  create() {
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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

  private renderVisibleTerrain() {
    const wv = this.cameras.main.worldView;
    const left = wv.x - TILE_W;
    const right = wv.x + wv.width + TILE_W;
    const top = wv.y - TILE_H;
    const bottom = wv.y + wv.height + TILE_H;

    // Approximate q,r range from pixel bounds
    // From hexToPixel: x = TILE_W * (q + r*0.5), y = TILE_H * 0.75 * r
    // So: r ≈ y / R_STEP_Y, q ≈ (x - r * R_STEP_X) / Q_STEP_X
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

        if (!this.terrainSprites.has(key)) {
          const terrain = getTerrain(q, r);
          // Round to integer pixels + slight overscale to hide seams
          const sprite = this.add.image(Math.round(x), Math.round(y), terrain.textureKey);
          sprite.setScale(1.01);
          sprite.setDepth(-1);
          this.terrainSprites.set(key, sprite);
        }
      }
    }

    this.terrainSprites.forEach((sprite, key) => {
      if (!visible.has(key)) {
        sprite.destroy();
        this.terrainSprites.delete(key);
      }
    });
  }

  applyLayout(layout: WorldLayout) {
    if (!this.sys?.displayList) return;

    const activeLocIds = new Set(layout.locations.map((l) => l.id));
    this.locationObjects.forEach((obj, id) => {
      if (!activeLocIds.has(id)) { obj.destroy(); this.locationObjects.delete(id); }
    });
    for (const loc of layout.locations) {
      if (!this.locationObjects.has(loc.id)) {
        this.locationObjects.set(loc.id, new LocationCluster(this, loc));
      }
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
    this.locationObjects.forEach((o) => o.destroy());
    this.agentObjects.forEach((o) => o.destroy());
    this.locationObjects.clear();
    this.agentObjects.clear();
  }
}
