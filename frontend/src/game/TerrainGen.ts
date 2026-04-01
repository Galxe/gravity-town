import { createNoise2D } from 'simplex-noise';

const SEED = 'gravity-town-42';

/** Simple seedable PRNG (Mulberry32). */
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

/** Terrain biomes ordered by elevation. */
export type Biome = 'sand' | 'grass' | 'dirt' | 'stone';

/** Terrain tile variants per biome. */
const VARIANTS: Record<Biome, string[]> = {
  sand:  ['sand_05', 'sand_07'],
  grass: ['grass_05', 'grass_07', 'grass_11', 'grass_14'],
  dirt:  ['dirt_05', 'dirt_07', 'dirt_11'],
  stone: ['stone_05', 'stone_07'],
};

export interface TerrainTile {
  biome: Biome;
  variant: string;
  textureKey: string;
}

/**
 * Deterministic terrain for hex coordinate (q, r).
 * Uses layered simplex noise to decide biome + variant.
 */
export function getTerrain(q: number, r: number): TerrainTile {
  // Pointy-top axial → cartesian for noise sampling
  const x = (q + r * 0.5) * 0.12;
  const y = r * 0.1;

  const n = noise2D(x, y);

  let biome: Biome;
  if (n < -0.35) biome = 'sand';
  else if (n < 0.25) biome = 'grass';
  else if (n < 0.55) biome = 'dirt';
  else biome = 'stone';

  const detail = noise2D_2(x * 3, y * 3);
  const variants = VARIANTS[biome];
  const idx = Math.abs(Math.floor((detail + 1) * 0.5 * variants.length)) % variants.length;
  const variant = variants[idx];

  return { biome, variant, textureKey: `terrain_${variant}` };
}

/** All unique texture keys that need preloading. */
export function allTerrainTextureKeys(): { key: string; file: string }[] {
  const result: { key: string; file: string }[] = [];
  for (const variants of Object.values(VARIANTS)) {
    for (const v of variants) {
      result.push({ key: `terrain_${v}`, file: `/tiles/terrain/${v}.png` });
    }
  }
  return result;
}
