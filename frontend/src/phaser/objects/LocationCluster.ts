import * as Phaser from 'phaser';
import type { ResolvedLocation } from '../../game/world/types';
import { buildingKeyForLocation, buildingIdForLocation } from '../../game/BuildingTags';
import { TILE_W, TILE_H } from '../../game/world/HexGrid';
import { StoreBridge } from '../StoreBridge';
import { generateBuildingTexture, AGENT_COLORS } from '../CartoonTextures';

const CLICK_THRESHOLD = 8;
const SELECT_COLOR = 0xd4a030; // warm gold

// Cartoon owner colors
const OWNER_COLORS = [
  0xc0503a, // red
  0x4a7eb5, // blue
  0x4a9e5c, // green
  0xd4a030, // gold
  0x7b5ea7, // purple
  0x3a9e9e, // cyan
  0xc06090, // pink
  0x8b5e3c, // wood
];

export class LocationCluster extends Phaser.GameObjects.Container {
  private tile: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private ownerLabel: Phaser.GameObjects.Text;
  private selectionRing: Phaser.GameObjects.Graphics;
  private ownerOverlay: Phaser.GameObjects.Image | null = null;
  private ownerBorder: Phaser.GameObjects.Graphics;
  public locationId: number;
  private cx: number;
  private cy: number;

  constructor(scene: Phaser.Scene, loc: ResolvedLocation) {
    super(scene, 0, 0);
    this.locationId = loc.id;
    scene.add.existing(this);
    this.setDepth(1);

    this.cx = loc.center.x;
    this.cy = loc.center.y;

    // Owner color overlay
    this.ownerBorder = scene.add.graphics();
    if (loc.ownerId > 0) {
      const color = OWNER_COLORS[(loc.ownerId - 1) % OWNER_COLORS.length];
      const r = TILE_H * 0.52;
      const texKey = `hex_overlay_${loc.ownerId}`;
      if (!scene.textures.exists(texKey)) {
        const size = Math.ceil(r * 2);
        const gfx = scene.add.graphics();
        gfx.fillStyle(0xffffff, 1);
        gfx.fillPoints(this._hexPoints(r, r, r), true);
        gfx.generateTexture(texKey, size, size);
        gfx.destroy();
      }

      this.ownerOverlay = scene.add.image(this.cx, this.cy, texKey);
      this.ownerOverlay.setTint(color);
      this.ownerOverlay.setAlpha(0.45);
      this.add(this.ownerOverlay);

      // Thick cartoon border
      this.ownerBorder.lineStyle(4, color, 0.85);
      this.ownerBorder.strokePoints(this._hexPoints(this.cx, this.cy, r), true);
    }
    this.add(this.ownerBorder);

    // Selection ring (hidden by default)
    this.selectionRing = scene.add.graphics();
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    // Building tile — roof color matches owner's meeple color
    let texKey: string;
    if (loc.ownerId > 0) {
      const buildingId = buildingIdForLocation(loc.name);
      const roofColor = AGENT_COLORS[(loc.ownerId - 1) % AGENT_COLORS.length].body;
      texKey = `building_${buildingId}_owner${loc.ownerId}`;
      generateBuildingTexture(scene, texKey, buildingId, roofColor);
    } else {
      const buildingId = buildingIdForLocation(loc.name);
      texKey = `building_${buildingId}_unowned`;
      generateBuildingTexture(scene, texKey, buildingId, 0xe0d0c0);
    }
    this.tile = scene.add.image(this.cx, this.cy, texKey);
    this.tile.setInteractive(
      new Phaser.Geom.Circle(60, 70, 50),
      Phaser.Geom.Circle.Contains,
    );
    this.add(this.tile);

    this.tile.on('pointerover', () => {
      this.tile.setScale(1.08);
      StoreBridge.hoverEntity({ type: 'location', id: loc.id });
    });
    this.tile.on('pointerout', () => {
      if (!this.selectionRing.visible) this.tile.setScale(1.0);
      else this.tile.setScale(1.15);
      StoreBridge.hoverEntity(null);
    });
    this.tile.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > CLICK_THRESHOLD) return;
      StoreBridge.selectEntity({ type: 'location', id: loc.id });
      StoreBridge.focusOn(this.cx, this.cy, 'far');
    });

    // Owner name label (above building) — cartoon font
    this.ownerLabel = scene.add.text(this.cx, this.cy - TILE_H / 2 - 2, loc.ownerName || '', {
      fontSize: '12px',
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontStyle: 'bold',
      color: loc.ownerId > 0
        ? '#' + OWNER_COLORS[(loc.ownerId - 1) % OWNER_COLORS.length].toString(16).padStart(6, '0')
        : '#8a7560',
      align: 'center',
      stroke: '#2c1810',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(this.ownerLabel);

    // Coordinate label (below building) — hand-drawn font
    this.label = scene.add.text(this.cx, this.cy + TILE_H / 2 + 4, `(${loc.centerHex.q},${loc.centerHex.r})`, {
      fontSize: '11px',
      fontFamily: 'Patrick Hand, cursive',
      color: '#8a7560',
      align: 'center',
      stroke: '#2c1810',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(this.label);
  }

  setSelected(selected: boolean) {
    if (selected) {
      this.tile.setScale(1.15);
      this.selectionRing.clear();
      // Warm gold selection ring with cartoon feel
      this.selectionRing.lineStyle(5, SELECT_COLOR, 0.9);
      this.selectionRing.strokeCircle(this.cx, this.cy, TILE_W * 0.55);
      this.selectionRing.lineStyle(3, SELECT_COLOR, 0.3);
      this.selectionRing.strokeCircle(this.cx, this.cy, TILE_W * 0.65);
      this.selectionRing.setVisible(true);
    } else {
      this.tile.setScale(1.0);
      this.selectionRing.setVisible(false);
    }
  }

  /** Pointy-top hex vertices */
  private _hexPoints(cx: number, cy: number, radius: number): Phaser.Geom.Point[] {
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

  destroy(fromScene?: boolean) {
    this.tile.destroy();
    this.label.destroy();
    this.ownerLabel.destroy();
    this.selectionRing.destroy();
    this.ownerOverlay?.destroy();
    this.ownerBorder.destroy();
    super.destroy(fromScene);
  }
}
