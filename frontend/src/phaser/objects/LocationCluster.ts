import * as Phaser from 'phaser';
import type { ResolvedLocation } from '../../game/world/types';
import { hexVertices, DISPLAY_W, DISPLAY_H, HEX_SCALE } from '../../game/world/HexGrid';
import { StoreBridge } from '../StoreBridge';
import { BUILDING_TILES, tileKey, tilePath } from '../../game/TerrainGen';
import { recolorTexture } from '../utils/recolorRoof';

const CLICK_THRESHOLD = 8;
const SELECT_COLOR = 0xd4a030;

const OWNER_COLORS = [
  0xc0503a, 0x4a7eb5, 0x4a9e5c, 0xd4a030,
  0x7b5ea7, 0x3a9e9e, 0xc06090, 0x8b5e3c,
];

/** Resolve location name to a Kenney building tile number. */
function buildingTileForLocation(name: string): number {
  const lower = name.toLowerCase();
  const keywords: [string, string][] = [
    ['mine', 'medieval_mine'],
    ['tavern', 'medieval_smallCastle'],
    ['castle', 'medieval_castle'],
    ['farm', 'medieval_farm'],
    ['church', 'medieval_church'],
    ['tower', 'medieval_tower'],
    ['windmill', 'medieval_windmill'],
    ['lumber', 'medieval_lumber'],
    ['cabin', 'medieval_cabin'],
    ['smith', 'medieval_blacksmith'],
    ['archery', 'medieval_archery'],
    ['ruin', 'medieval_ruins'],
  ];
  for (const [kw, building] of keywords) {
    if (lower.includes(kw) && BUILDING_TILES[building]) {
      return BUILDING_TILES[building];
    }
  }
  return BUILDING_TILES.medieval_house;
}

export class LocationCluster extends Phaser.GameObjects.Container {
  private buildingIcon: Phaser.GameObjects.Image;
  private ownerBorder: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private ownerLabel: Phaser.GameObjects.Text;
  private selectionRing: Phaser.GameObjects.Graphics;
  public locationId: number;
  private cx: number;
  private cy: number;

  constructor(scene: Phaser.Scene, loc: ResolvedLocation) {
    super(scene, 0, 0);
    this.locationId = loc.id;
    scene.add.existing(this);
    this.setDepth(1);

    this.cx = loc.center.x + DISPLAY_W / 2;
    this.cy = loc.center.y + DISPLAY_H / 2;

    // Owner hex border — thick colored outline around the hex
    this.ownerBorder = scene.add.graphics();
    if (loc.ownerId > 0) {
      const color = OWNER_COLORS[(loc.ownerId - 1) % OWNER_COLORS.length];
      const verts = hexVertices(this.cx, this.cy, DISPLAY_H * 0.48);
      const pts = verts.map(v => new Phaser.Geom.Point(v.x, v.y));
      this.ownerBorder.lineStyle(4, color, 0.85);
      this.ownerBorder.strokePoints(pts, true);
    }
    this.add(this.ownerBorder);

    // Selection ring (hidden by default)
    this.selectionRing = scene.add.graphics();
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    // Building icon — recolored roof per owner
    const buildingNum = buildingTileForLocation(loc.name);
    const baseTexKey = tileKey(buildingNum);
    const ownerColor = loc.ownerId > 0
      ? OWNER_COLORS[(loc.ownerId - 1) % OWNER_COLORS.length]
      : 0x888888;
    const coloredTexKey = `${baseTexKey}_c${loc.ownerId}`;

    if (!scene.textures.exists(baseTexKey)) {
      scene.load.image(baseTexKey, tilePath(buildingNum));
      scene.load.once('complete', () => {
        if (scene.textures.exists(baseTexKey)) {
          recolorTexture(scene, baseTexKey, coloredTexKey, ownerColor);
          if (this.buildingIcon && scene.textures.exists(coloredTexKey)) {
            this.buildingIcon.setTexture(coloredTexKey);
          }
        }
      });
      scene.load.start();
    } else {
      recolorTexture(scene, baseTexKey, coloredTexKey, ownerColor);
    }

    const useKey = scene.textures.exists(coloredTexKey) ? coloredTexKey : baseTexKey;
    this.buildingIcon = scene.add.image(this.cx, this.cy, useKey);
    this.buildingIcon.setScale(HEX_SCALE * 0.55);
    this.buildingIcon.setInteractive(
      new Phaser.Geom.Circle(240, 280, 200),
      Phaser.Geom.Circle.Contains,
    );
    this.add(this.buildingIcon);

    this.buildingIcon.on('pointerover', () => {
      this.buildingIcon.setScale(HEX_SCALE * 0.62);
      StoreBridge.hoverEntity({ type: 'location', id: loc.id });
    });
    this.buildingIcon.on('pointerout', () => {
      if (!this.selectionRing.visible) this.buildingIcon.setScale(HEX_SCALE * 0.55);
      else this.buildingIcon.setScale(HEX_SCALE * 0.6);
      StoreBridge.hoverEntity(null);
    });
    this.buildingIcon.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > CLICK_THRESHOLD) return;
      StoreBridge.selectEntity({ type: 'location', id: loc.id });
      StoreBridge.focusOn(this.cx, this.cy, 'far');
    });

    // Owner name label (above hex)
    const ownerColorHex = loc.ownerId > 0
      ? '#' + OWNER_COLORS[(loc.ownerId - 1) % OWNER_COLORS.length].toString(16).padStart(6, '0')
      : '#8a8a8a';
    this.ownerLabel = scene.add.text(this.cx, this.cy - DISPLAY_H / 2 - 6, loc.ownerName || '', {
      fontSize: '13px',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      color: ownerColorHex,
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(this.ownerLabel);

    // Coordinate label (below hex)
    this.label = scene.add.text(this.cx, this.cy + DISPLAY_H / 2 + 6, `(${loc.centerHex.q},${loc.centerHex.r})`, {
      fontSize: '10px',
      fontFamily: 'system-ui, sans-serif',
      color: '#aaaaaa',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.add(this.label);
  }

  setSelected(selected: boolean) {
    if (selected) {
      this.buildingIcon.setScale(HEX_SCALE * 0.6);
      this.selectionRing.clear();
      this.selectionRing.lineStyle(3, SELECT_COLOR, 0.9);
      this.selectionRing.strokeCircle(this.cx, this.cy, DISPLAY_W * 0.5);
      this.selectionRing.lineStyle(2, SELECT_COLOR, 0.3);
      this.selectionRing.strokeCircle(this.cx, this.cy, DISPLAY_W * 0.6);
      this.selectionRing.setVisible(true);
    } else {
      this.buildingIcon.setScale(HEX_SCALE * 0.55);
      this.selectionRing.setVisible(false);
    }
  }

  destroy(fromScene?: boolean) {
    this.buildingIcon.destroy();
    this.ownerBorder.destroy();
    this.label.destroy();
    this.ownerLabel.destroy();
    this.selectionRing.destroy();
    super.destroy(fromScene);
  }
}
