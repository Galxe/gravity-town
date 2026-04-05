import type { WorldPoint } from './types';

/** Kenney tile dimensions (pointy-top hex, 120×140). */
export const TILE_W = 120;
export const TILE_H = 140;

export const LOCATION_SPREAD = 1;

/** World boundary radius — must match GameEngine.MAP_RADIUS */
export const MAP_RADIUS = 4;

/** Axial hex distance from origin: max(|q|, |r|, |q+r|) */
export function hexDist(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/** Check if (q,r) is within world boundary */
export function inBounds(q: number, r: number): boolean {
  return hexDist(q, r) <= MAP_RADIUS;
}

/**
 * Pointy-top hex: axial (q, r) → pixel position.
 * Derived from Kenney 120×140 tile tiling rules:
 *   q+1 step: x += TILE_W,      y += 0
 *   r+1 step: x += TILE_W / 2,  y += TILE_H * 3/4
 */
export function hexToPixel(q: number, r: number): WorldPoint {
  return {
    x: TILE_W * (q + r * 0.5),
    y: TILE_H * 0.75 * r,
  };
}

/** 6 direct neighbors of a hex in axial coordinates. */
export function hexNeighbors(q: number, r: number): [number, number][] {
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ];
}

/** All hex cells on a ring of given radius around (cq, cr). */
export function hexRing(cq: number, cr: number, radius: number): [number, number][] {
  if (radius === 0) return [[cq, cr]];
  const results: [number, number][] = [];
  const directions: [number, number][] = [
    [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
  ];
  let q = cq + radius * directions[4][0];
  let r = cr + radius * directions[4][1];
  for (const [dq, dr] of directions) {
    for (let i = 0; i < radius; i++) {
      results.push([q, r]);
      q += dq;
      r += dr;
    }
  }
  return results;
}
