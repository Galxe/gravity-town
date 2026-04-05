import * as Phaser from 'phaser';
import { TILE_W, TILE_H } from '../game/world/HexGrid';

// ── Cartoon color palettes ──────────────────────────────────────────

const BIOME_COLORS: Record<string, { fill: number; light: number; dark: number; outline: number; detail: number }> = {
  grass: { fill: 0x7ec850, light: 0x9edc6e, dark: 0x5ea030, outline: 0x3d6b20, detail: 0x4d8828 },
  sand:  { fill: 0xe8cc80, light: 0xf0dda0, dark: 0xd0a850, outline: 0x8a6830, detail: 0xc0a050 },
  dirt:  { fill: 0xb08050, light: 0xc89868, dark: 0x906838, outline: 0x5c3a20, detail: 0x785028 },
  stone: { fill: 0x8898a8, light: 0xa0b0c0, dark: 0x687888, outline: 0x405060, detail: 0x586878 },
};

const BUILDING_STYLES: Record<string, { wall: number; roof: number; accent: number }> = {
  medieval_smallCastle: { wall: 0xd4b896, roof: 0xc0503a, accent: 0x8b5e3c },
  medieval_mine:        { wall: 0x8a7060, roof: 0x605040, accent: 0xd4a030 },
  medieval_blacksmith:  { wall: 0xb09878, roof: 0x7b5ea7, accent: 0xf08030 },
  medieval_farm:        { wall: 0xc8b898, roof: 0x4a9e5c, accent: 0xd4a030 },
  medieval_church:      { wall: 0xe0d0b8, roof: 0x4a7eb5, accent: 0xd4a030 },
  medieval_tower:       { wall: 0xa09080, roof: 0x606878, accent: 0x3a9e9e },
  medieval_windmill:    { wall: 0xd8c8a8, roof: 0xc0503a, accent: 0x4a7eb5 },
  medieval_lumber:      { wall: 0x8b5e3c, roof: 0x4a9e5c, accent: 0xa67c52 },
  medieval_cabin:       { wall: 0xa67c52, roof: 0x5c3a1e, accent: 0x4a9e5c },
  medieval_house:       { wall: 0xd4b896, roof: 0xc06090, accent: 0x7b5ea7 },
};

const AGENT_COLORS: { body: number; face: number }[] = [
  { body: 0x4a7eb5, face: 0xfff0d8 },  // blue
  { body: 0x4a9e5c, face: 0xfff0d8 },  // green
  { body: 0x7b5ea7, face: 0xfff0d8 },  // purple
  { body: 0xc0503a, face: 0xfff0d8 },  // red
  { body: 0xd4a030, face: 0xfff0d8 },  // yellow
  { body: 0xe0d0b8, face: 0xfff0d8 },  // white
  { body: 0x404040, face: 0xfff0d8 },  // black
];

// ── Hex geometry helpers ────────────────────────────────────────────

function hexPoints(cx: number, cy: number, radius: number): Phaser.Geom.Point[] {
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

/** Simple seeded hash for deterministic details. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + 13) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

// ── Generators ──────────────────────────────────────────────────────

function generateTerrainTexture(scene: Phaser.Scene, key: string, biome: string, seed: number) {
  if (scene.textures.exists(key)) return;

  const gfx = scene.add.graphics();
  const cx = TILE_W / 2;
  const cy = TILE_H / 2;
  const palette = BIOME_COLORS[biome] || BIOME_COLORS.grass;

  // Outer hex radius (fill area)
  const outerR = TILE_H * 0.5;
  const innerR = outerR - 3;

  // Fill base color
  gfx.fillStyle(palette.fill, 1);
  gfx.fillPoints(hexPoints(cx, cy, outerR), true);

  // Light highlight on top half
  gfx.fillStyle(palette.light, 0.35);
  gfx.fillPoints(hexPoints(cx, cy - 4, innerR * 0.7), true);

  // Dark shadow on bottom
  gfx.fillStyle(palette.dark, 0.25);
  const bottomPts = hexPoints(cx, cy + 6, innerR * 0.75);
  gfx.fillPoints(bottomPts, true);

  // Biome-specific details
  const rng = (i: number) => hash(seed + i, seed * 3 + i * 7);

  if (biome === 'grass') {
    // Grass tufts — small arcs
    for (let i = 0; i < 8; i++) {
      const dx = (rng(i) - 0.5) * TILE_W * 0.6;
      const dy = (rng(i + 50) - 0.5) * TILE_H * 0.4;
      const size = 3 + rng(i + 100) * 4;
      gfx.fillStyle(palette.detail, 0.5 + rng(i + 200) * 0.3);
      gfx.fillCircle(cx + dx, cy + dy, size);
    }
  } else if (biome === 'sand') {
    // Sand ripples — thin lines
    for (let i = 0; i < 5; i++) {
      const y = cy - 20 + i * 10 + (rng(i) - 0.5) * 6;
      gfx.lineStyle(1.5, palette.detail, 0.3);
      gfx.lineBetween(cx - 30 + rng(i + 10) * 10, y, cx + 30 - rng(i + 20) * 10, y);
    }
  } else if (biome === 'dirt') {
    // Pebbles
    for (let i = 0; i < 6; i++) {
      const dx = (rng(i) - 0.5) * TILE_W * 0.5;
      const dy = (rng(i + 30) - 0.5) * TILE_H * 0.35;
      gfx.fillStyle(palette.detail, 0.5);
      gfx.fillCircle(cx + dx, cy + dy, 2 + rng(i + 60) * 3);
    }
  } else if (biome === 'stone') {
    // Cracks — jagged lines
    for (let i = 0; i < 3; i++) {
      const sx = cx + (rng(i) - 0.5) * 40;
      const sy = cy + (rng(i + 10) - 0.5) * 30;
      gfx.lineStyle(1.5, palette.detail, 0.4);
      gfx.lineBetween(sx, sy, sx + (rng(i + 20) - 0.5) * 25, sy + (rng(i + 30) - 0.5) * 20);
    }
  }

  // Thick cartoon outline
  gfx.lineStyle(3.5, palette.outline, 0.85);
  gfx.strokePoints(hexPoints(cx, cy, outerR - 1), true);

  gfx.generateTexture(key, TILE_W, TILE_H);
  gfx.destroy();
}

function generateBuildingTexture(scene: Phaser.Scene, key: string, buildingId: string) {
  if (scene.textures.exists(key)) return;

  const gfx = scene.add.graphics();
  const cx = TILE_W / 2;
  const cy = TILE_H / 2;
  const style = BUILDING_STYLES[buildingId] || BUILDING_STYLES.medieval_house;

  // Shadow under building
  gfx.fillStyle(0x000000, 0.15);
  gfx.fillEllipse(cx + 2, cy + 26, 52, 14);

  // Building body
  const bw = 36;
  const bh = 40;
  const bx = cx - bw / 2;
  const by = cy - bh / 2 + 8;

  // Wall
  gfx.fillStyle(style.wall, 1);
  gfx.fillRoundedRect(bx, by, bw, bh, 4);

  // Wall highlight (left side)
  gfx.fillStyle(0xffffff, 0.15);
  gfx.fillRoundedRect(bx, by, bw * 0.4, bh, { tl: 4, bl: 4, tr: 0, br: 0 });

  // Door
  gfx.fillStyle(style.accent, 1);
  gfx.fillRoundedRect(cx - 5, by + bh - 14, 10, 14, { tl: 5, tr: 5, bl: 0, br: 0 });

  // Window(s)
  gfx.fillStyle(0xfff8d0, 0.9);
  gfx.fillRoundedRect(cx - 12, by + 8, 7, 7, 2);
  gfx.fillRoundedRect(cx + 5, by + 8, 7, 7, 2);
  // Window cross
  gfx.lineStyle(1, style.accent, 0.7);
  gfx.lineBetween(cx - 12, by + 11.5, cx - 5, by + 11.5);
  gfx.lineBetween(cx - 8.5, by + 8, cx - 8.5, by + 15);
  gfx.lineBetween(cx + 5, by + 11.5, cx + 12, by + 11.5);
  gfx.lineBetween(cx + 8.5, by + 8, cx + 8.5, by + 15);

  // Roof
  gfx.fillStyle(style.roof, 1);
  gfx.fillTriangle(cx - bw / 2 - 6, by + 2, cx + bw / 2 + 6, by + 2, cx, by - 22);

  // Roof highlight
  gfx.fillStyle(0xffffff, 0.12);
  gfx.fillTriangle(cx - bw / 2 - 4, by + 1, cx, by + 1, cx - 2, by - 20);

  // Building-specific accent
  if (buildingId === 'medieval_mine') {
    // Pickaxe icon
    gfx.lineStyle(3, 0xd4a030, 1);
    gfx.lineBetween(cx + 16, cy - 16, cx + 26, cy - 6);
    gfx.fillStyle(0x888888, 1);
    gfx.fillTriangle(cx + 24, cy - 8, cx + 28, cy - 4, cx + 22, cy - 2);
  } else if (buildingId === 'medieval_farm') {
    // Wheat stalk
    gfx.lineStyle(2, 0xb8960c, 1);
    gfx.lineBetween(cx + 20, cy + 20, cx + 20, cy - 5);
    gfx.fillStyle(0xd4a030, 1);
    gfx.fillEllipse(cx + 20, cy - 8, 5, 8);
  } else if (buildingId === 'medieval_smallCastle') {
    // Flag
    gfx.lineStyle(2, 0x5c3a1e, 1);
    gfx.lineBetween(cx, by - 22, cx, by - 36);
    gfx.fillStyle(0xc0503a, 1);
    gfx.fillTriangle(cx, by - 36, cx, by - 28, cx + 10, by - 32);
  } else if (buildingId === 'medieval_church') {
    // Cross on top
    gfx.lineStyle(2.5, style.accent, 1);
    gfx.lineBetween(cx, by - 22, cx, by - 32);
    gfx.lineBetween(cx - 5, by - 28, cx + 5, by - 28);
  } else if (buildingId === 'medieval_windmill') {
    // Windmill blades
    gfx.lineStyle(2.5, style.accent, 0.9);
    const mx = cx + 2, my = by - 10;
    gfx.lineBetween(mx, my, mx - 12, my - 12);
    gfx.lineBetween(mx, my, mx + 12, my - 8);
    gfx.lineBetween(mx, my, mx + 8, my + 12);
    gfx.lineBetween(mx, my, mx - 10, my + 8);
  }

  // Thick cartoon outline on body
  gfx.lineStyle(2.5, 0x3a2010, 0.8);
  gfx.strokeRoundedRect(bx, by, bw, bh, 4);

  // Roof outline
  gfx.lineStyle(2.5, 0x3a2010, 0.8);
  const roofPts = [
    new Phaser.Geom.Point(cx - bw / 2 - 6, by + 2),
    new Phaser.Geom.Point(cx, by - 22),
    new Phaser.Geom.Point(cx + bw / 2 + 6, by + 2),
  ];
  gfx.strokePoints(roofPts, true);

  gfx.generateTexture(key, TILE_W, TILE_H);
  gfx.destroy();
}

function generateAgentTexture(scene: Phaser.Scene, key: string, colorIdx: number) {
  if (scene.textures.exists(key)) return;

  const gfx = scene.add.graphics();
  const size = 64;
  const cx = size / 2;
  const cy = size / 2;
  const palette = AGENT_COLORS[colorIdx % AGENT_COLORS.length];

  // Shadow
  gfx.fillStyle(0x000000, 0.15);
  gfx.fillEllipse(cx + 1, cy + 14, 22, 6);

  // Body (rounded pill shape)
  gfx.fillStyle(palette.body, 1);
  gfx.fillRoundedRect(cx - 10, cy - 4, 20, 20, 8);

  // Body highlight
  gfx.fillStyle(0xffffff, 0.15);
  gfx.fillRoundedRect(cx - 8, cy - 2, 8, 16, 4);

  // Head
  gfx.fillStyle(palette.face, 1);
  gfx.fillCircle(cx, cy - 10, 11);

  // Head highlight
  gfx.fillStyle(0xffffff, 0.12);
  gfx.fillCircle(cx - 3, cy - 13, 6);

  // Eyes
  gfx.fillStyle(0x2c1810, 1);
  gfx.fillCircle(cx - 4, cy - 11, 2.2);
  gfx.fillCircle(cx + 4, cy - 11, 2.2);

  // Eye shine
  gfx.fillStyle(0xffffff, 0.9);
  gfx.fillCircle(cx - 3.2, cy - 12, 0.9);
  gfx.fillCircle(cx + 4.8, cy - 12, 0.9);

  // Smile
  gfx.lineStyle(1.5, 0x2c1810, 0.7);
  gfx.beginPath();
  gfx.arc(cx, cy - 8, 4, Phaser.Math.DegToRad(10), Phaser.Math.DegToRad(170), false);
  gfx.strokePath();

  // Rosy cheeks
  gfx.fillStyle(0xf0a0a0, 0.3);
  gfx.fillCircle(cx - 7, cy - 8, 2.5);
  gfx.fillCircle(cx + 7, cy - 8, 2.5);

  // Outline
  gfx.lineStyle(2, 0x2c1810, 0.7);
  gfx.strokeCircle(cx, cy - 10, 11);
  gfx.strokeRoundedRect(cx - 10, cy - 4, 20, 20, 8);

  gfx.generateTexture(key, size, size);
  gfx.destroy();
}

// ── Public API ──────────────────────────────────────────────────────

/** Generate all cartoon textures. Call during scene create(). */
export function generateAllTextures(scene: Phaser.Scene) {
  // Terrain: 4 biomes × several variants
  const terrainVariants: Record<string, string[]> = {
    sand:  ['sand_05', 'sand_07'],
    grass: ['grass_05', 'grass_07', 'grass_11', 'grass_14'],
    dirt:  ['dirt_05', 'dirt_07', 'dirt_11'],
    stone: ['stone_05', 'stone_07'],
  };

  for (const [biome, variants] of Object.entries(terrainVariants)) {
    variants.forEach((v, i) => {
      generateTerrainTexture(scene, `terrain_${v}`, biome, i * 1000 + biome.charCodeAt(0));
    });
  }

  // Buildings
  for (const buildingId of Object.keys(BUILDING_STYLES)) {
    generateBuildingTexture(scene, `building_${buildingId}`, buildingId);
  }

  // Agents (meeples)
  const colors = ['blue', 'green', 'purple', 'red', 'yellow', 'white', 'black'];
  colors.forEach((c, i) => {
    generateAgentTexture(scene, `meeple_${c}`, i);
  });
}
