import { createNoise2D } from 'simplex-noise';

const SEED = 'gravity-town-42';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const noise2D = createNoise2D(mulberry32(hashString(SEED)));
const noise2D_2 = createNoise2D(mulberry32(hashString(SEED + '-detail')));
const noise2D_3 = createNoise2D(mulberry32(hashString(SEED + '-feature')));

/**
 * Kenney tile mapping — tile numbers to file paths.
 *
 * Terrain categories:
 *   grass:  tile1-17, tile44 (flat green)
 *   sand:   tile42 (flat), tile45-61
 *   dirt:   tile43 (flat), tile23-39
 *   stone:  tile40 (flat), tile79-95
 *   mars:   tile41 (flat), tile62-78
 *
 * Buildings:
 *   medieval: tile124-135, tile157-158, tile160
 */

// Clean base terrain tiles only — no trees, rocks, water, or other decorations
const GRASS_TILES = [44]; // flat green
const SAND_TILES = [42];  // flat beige
const DIRT_TILES = [43];  // flat brown
const STONE_TILES = [40]; // flat gray
const MARS_TILES = [41];  // flat red-brown

// Building tile numbers
export const BUILDING_TILES: Record<string, number> = {
  medieval_mine: 160,
  medieval_farm: 125,
  medieval_house: 126,
  medieval_cabin: 127,
  medieval_blacksmith: 128,
  medieval_lumber: 129,
  medieval_tower: 131,
  medieval_ruins: 132,
  medieval_castle: 134,
  medieval_smallCastle: 135,
  medieval_windmill: 124,
  medieval_church: 157,
  medieval_archway: 158,
  medieval_archery: 130,
  medieval_openCastle: 133,
};

export type BiomeType = 'grass' | 'sand' | 'dirt' | 'stone' | 'mars';

export interface TerrainTile {
  biome: BiomeType;
  tileNum: number;
  textureKey: string;
}

/** Convert tile number to asset path. */
export function tilePath(num: number): string {
  return `/tiles/kenney/tile${num}.png`;
}

/** Convert tile number to Phaser texture key. */
export function tileKey(num: number): string {
  return `kenney_${num}`;
}

/** All unique tile numbers that need preloading. */
export function allTileNumbers(): number[] {
  const all = new Set<number>();
  [GRASS_TILES, SAND_TILES, DIRT_TILES, STONE_TILES, MARS_TILES]
    .forEach(arr => arr.forEach(n => all.add(n)));
  Object.values(BUILDING_TILES).forEach(n => all.add(n));
  return Array.from(all);
}

/**
 * Deterministic terrain for hex coordinate (q, r).
 */
export function getTerrain(q: number, r: number): TerrainTile {
  const x = (q + r * 0.5) * 0.12;
  const y = r * 0.1;

  const elevation = noise2D(x, y);
  const moisture = noise2D_2(x * 1.5 + 100, y * 1.5 + 100);
  noise2D_3(x * 3, y * 3); // detail noise (reserved for future use)

  let biome: BiomeType;

  if (elevation > 0.55) {
    biome = 'stone';
  } else if (elevation > 0.35) {
    biome = 'mars';
  } else if (moisture < -0.25) {
    biome = 'sand';
  } else if (moisture < 0.15) {
    biome = 'dirt';
  } else {
    biome = 'grass';
  }

  const BIOME_TILE: Record<BiomeType, number> = {
    grass: GRASS_TILES[0],
    sand: SAND_TILES[0],
    dirt: DIRT_TILES[0],
    stone: STONE_TILES[0],
    mars: MARS_TILES[0],
  };
  const tileNum = BIOME_TILE[biome];

  return { biome, tileNum, textureKey: tileKey(tileNum) };
}
