import * as Phaser from 'phaser';
import type { ResolvedAgent } from '../../game/world/types';
import { StoreBridge } from '../StoreBridge';
import { DISPLAY_W } from '../../game/world/HexGrid';

const SELECT_COLOR = 0xd4a030;
const CLICK_THRESHOLD = 8;
const AGENT_RADIUS = 12;

const OWNER_COLORS = [
  0xc0503a, 0x4a7eb5, 0x4a9e5c, 0xd4a030,
  0x7b5ea7, 0x3a9e9e, 0xc06090, 0x8b5e3c,
];

export function meepleKey(agentId: number): string {
  return `agent_marker_${agentId}`;
}

export class AgentSprite extends Phaser.GameObjects.Container {
  private marker: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private selectionRing: Phaser.GameObjects.Graphics;
  private hitArea: Phaser.GameObjects.Zone;
  public agentId: number;
  private _selected = false;
  private agentData: ResolvedAgent;
  private ownerColor: number;

  constructor(scene: Phaser.Scene, agent: ResolvedAgent) {
    super(scene, agent.position.x, agent.position.y);
    this.agentId = agent.id;
    this.agentData = agent;
    this.ownerColor = OWNER_COLORS[(agent.id - 1) % OWNER_COLORS.length];
    scene.add.existing(this);
    this.setDepth(2);

    // Selection ring
    this.selectionRing = scene.add.graphics();
    this.selectionRing.setVisible(false);
    this.add(this.selectionRing);

    // Agent marker (colored circle with border)
    this.marker = scene.add.graphics();
    this.drawMarker(false);
    this.add(this.marker);

    // Hit area for interaction
    this.hitArea = scene.add.zone(0, 0, AGENT_RADIUS * 3, AGENT_RADIUS * 3);
    this.hitArea.setInteractive();
    this.add(this.hitArea);

    // Name label
    this.label = scene.add.text(0, -(AGENT_RADIUS + 14), agent.name, {
      fontSize: '12px',
      fontFamily: 'system-ui, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { x: 5, y: 2 },
      align: 'center',
    }).setOrigin(0.5).setVisible(false);
    this.add(this.label);

    this.hitArea.on('pointerover', () => {
      this.label.setVisible(true);
      this.drawMarker(true);
      StoreBridge.hoverEntity({ type: 'agent', id: agent.id });
    });
    this.hitArea.on('pointerout', () => {
      if (!this._selected) {
        this.label.setVisible(false);
        this.drawMarker(false);
      }
      StoreBridge.hoverEntity(null);
    });
    this.hitArea.on('pointerup', (p: Phaser.Input.Pointer) => {
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

  private drawMarker(hovered: boolean) {
    this.marker.clear();
    const r = hovered ? AGENT_RADIUS * 1.2 : AGENT_RADIUS;
    // Shadow
    this.marker.fillStyle(0x000000, 0.3);
    this.marker.fillCircle(1, 2, r);
    // Fill
    this.marker.fillStyle(this.ownerColor, 1);
    this.marker.fillCircle(0, 0, r);
    // Border
    this.marker.lineStyle(2, 0xffffff, 0.8);
    this.marker.strokeCircle(0, 0, r);
    // Inner shine
    this.marker.fillStyle(0xffffff, 0.2);
    this.marker.fillCircle(-r * 0.25, -r * 0.25, r * 0.4);
  }

  setSelected(selected: boolean) {
    this._selected = selected;
    if (selected) {
      this.drawMarker(true);
      this.selectionRing.clear();
      this.selectionRing.lineStyle(3, SELECT_COLOR, 0.9);
      this.selectionRing.strokeCircle(0, 0, AGENT_RADIUS + 6);
      this.selectionRing.lineStyle(2, SELECT_COLOR, 0.3);
      this.selectionRing.strokeCircle(0, 0, AGENT_RADIUS + 12);
      this.selectionRing.setVisible(true);
      this.label.setVisible(true);
    } else {
      this.drawMarker(false);
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
    this.marker.destroy();
    this.label.destroy();
    this.selectionRing.destroy();
    this.hitArea.destroy();
    super.destroy(fromScene);
  }
}
