import * as Phaser from 'phaser';
import { HexMapScene } from './scenes/HexMapScene';

export function createPhaserGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: '#080c16',
    scene: [HexMapScene],
    render: {
      antialias: true,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: '100%',
      height: '100%',
    },
  });
}
