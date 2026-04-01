import * as Phaser from 'phaser';
import type { ResolvedAgent } from '../../game/world/types';
import { StoreBridge } from '../StoreBridge';

const MEEPLE_COLORS = ['blue', 'green', 'purple', 'red', 'yellow', 'white', 'black'];
const MEEPLE_SCALE = 0.55;
const SELECT_COLOR = 0x60a5fa;
const CLICK_THRESHOLD = 8;

export function meepleKey(agentId: number): string {
  return `meeple_${MEEPLE_COLORS[agentId % MEEPLE_COLORS.length]}`;
}

export function allMeepleTextureKeys(): { key: string; file: string }[] {
  return MEEPLE_COLORS.map((c) => ({
    key: `meeple_${c}`,
    file: `/tiles/agents/meeple_${c}.png`,
  }));
}

export class AgentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private selectionRing: Phaser.GameObjects.Graphics;
  public agentId: number;
  private _selected = false;
  private agentData: ResolvedAgent;

  constructor(scene: Phaser.Scene, agent: ResolvedAgent) {
    super(scene, agent.position.x, agent.position.y);
    this.agentId = agent.id;
    this.agentData = agent;
    scene.add.existing(this);
    this.setDepth(2);

    // Selection ring (hidden by default)
    this.selectionRing = scene.add.graphics();
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    // Meeple sprite
    this.sprite = scene.add.image(0, 0, meepleKey(agent.id));
    this.sprite.setScale(MEEPLE_SCALE);
    this.sprite.setInteractive(
      new Phaser.Geom.Circle(32, 32, 30),
      Phaser.Geom.Circle.Contains,
    );
    this.add(this.sprite);

    // Name label (hidden by default)
    this.label = scene.add.text(0, -(32 * MEEPLE_SCALE + 12), agent.name, {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 4, y: 2 },
      align: 'center',
    }).setOrigin(0.5).setVisible(false);
    this.add(this.label);

    this.sprite.on('pointerover', () => {
      this.label.setVisible(true);
      this.sprite.setScale(MEEPLE_SCALE * 1.2);
      StoreBridge.hoverEntity({ type: 'agent', id: agent.id });
    });
    this.sprite.on('pointerout', () => {
      if (!this._selected) {
        this.label.setVisible(false);
        this.sprite.setScale(MEEPLE_SCALE);
      } else {
        this.sprite.setScale(MEEPLE_SCALE * 1.25);
      }
      StoreBridge.hoverEntity(null);
    });

    this.sprite.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > CLICK_THRESHOLD) return;
      const { x, y } = this.agentData.position;
      if (this._selected) {
        StoreBridge.focusOn(x, y, 'close');
      } else {
        StoreBridge.selectEntity({ type: 'agent', id: agent.id });
        StoreBridge.focusOn(x, y, 'far');
      }
    });
  }

  setSelected(selected: boolean) {
    this._selected = selected;
    if (selected) {
      this.sprite.setScale(MEEPLE_SCALE * 1.25);
      this.selectionRing.clear();
      this.selectionRing.lineStyle(3.5, SELECT_COLOR, 1);
      this.selectionRing.strokeCircle(0, 0, 24);
      this.selectionRing.lineStyle(2.5, SELECT_COLOR, 0.35);
      this.selectionRing.strokeCircle(0, 0, 30);
      this.selectionRing.setVisible(true);
      this.label.setVisible(true);
    } else {
      this.sprite.setScale(MEEPLE_SCALE);
      this.selectionRing.setVisible(false);
      this.label.setVisible(false);
    }
    this.setDepth(selected ? 3 : 2);
  }

  updatePosition(agent: ResolvedAgent) {
    this.agentData = agent;
    this.setPosition(agent.position.x, agent.position.y);
  }

  destroy(fromScene?: boolean) {
    this.sprite.destroy();
    this.label.destroy();
    this.selectionRing.destroy();
    super.destroy(fromScene);
  }
}
