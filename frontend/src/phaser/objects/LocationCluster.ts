import * as Phaser from 'phaser';
import type { ResolvedLocation } from '../../game/world/types';
import { buildingKeyForLocation } from '../../game/BuildingTags';
import { TILE_W, TILE_H } from '../../game/world/HexGrid';
import { StoreBridge } from '../StoreBridge';

const CLICK_THRESHOLD = 8;
const SELECT_COLOR = 0x60a5fa;

export class LocationCluster extends Phaser.GameObjects.Container {
  private tile: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private selectionRing: Phaser.GameObjects.Graphics;
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

    // Selection ring (hidden by default)
    this.selectionRing = scene.add.graphics();
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    // Building tile at 1:1 scale
    const texKey = buildingKeyForLocation(loc.name);
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

    // Label
    this.label = scene.add.text(this.cx, this.cy + TILE_H / 2 + 4, loc.name.toUpperCase(), {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffffff',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(this.label);
  }

  setSelected(selected: boolean) {
    if (selected) {
      this.tile.setScale(1.15);
      this.label.setScale(1.1);
      this.selectionRing.clear();
      this.selectionRing.lineStyle(4, SELECT_COLOR, 1);
      this.selectionRing.strokeCircle(this.cx, this.cy, TILE_W * 0.55);
      this.selectionRing.lineStyle(3, SELECT_COLOR, 0.35);
      this.selectionRing.strokeCircle(this.cx, this.cy, TILE_W * 0.65);
      this.selectionRing.setVisible(true);
    } else {
      this.tile.setScale(1.0);
      this.label.setScale(1.0);
      this.selectionRing.setVisible(false);
    }
  }

  destroy(fromScene?: boolean) {
    this.tile.destroy();
    this.label.destroy();
    this.selectionRing.destroy();
    super.destroy(fromScene);
  }
}
