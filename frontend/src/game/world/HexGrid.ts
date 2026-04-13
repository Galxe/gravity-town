import type { WorldPoint } from './types';

/**
 * Pointy-top hex grid using Kenney 4x tiles (480×561 px).
 */

/** Kenney 4x tile dimensions (pointy-top hex). */
export const TILE_W = 480;
export const TILE_H = 561;

/** Display scale — tiles are already high-res, render at reduced scale. */
export const HEX_SCALE = 0.25;

/** Scaled display dimensions. */
export const DISPLAY_W = TILE_W * HEX_SCALE; // 120
export const DISPLAY_H = TILE_H * HEX_SCALE; // ~140

/** World boundary radius — must match GameEngine.MAP_RADIUS */
export const MAP_RADIUS = 4;

export const LOCATION_SPREAD = 1;

/**
 * Pointy-top hex: axial (q, r) → pixel position (top-left corner).
 *   q+1 step: x += DISPLAY_W,           y += 0
 *   r+1 step: x += DISPLAY_W / 2,       y += DISPLAY_H * 3/4
 */
export function hexToPixel(q: number, r: number): WorldPoint {
  return {
    x: DISPLAY_W * (q + r * 0.5),
    y: DISPLAY_H * 0.75 * r,
  };
}

/** Hex center in world coordinates. */
export function hexCenter(q: number, r: number): WorldPoint {
  const { x, y } = hexToPixel(q, r);
  return { x: x + DISPLAY_W / 2, y: y + DISPLAY_H / 2 };
}

/** Axial hex distance from origin: max(|q|, |r|, |q+r|) */
export function hexDist(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/** Check if (q,r) is within world boundary */
export function inBounds(q: number, r: number): boolean {
  return hexDist(q, r) <= MAP_RADIUS;
}

/** 6 direct neighbors of a hex in axial coordinates. */
export function hexNeighbors(q: number, r: number): [number, number][] {
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ];
}

/**
 * 6 vertices of a pointy-top hex centered at (cx, cy) with given radius.
 * Vertex 0 at top (-30°), proceeding clockwise.
 */
export function hexVertices(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return pts;
}

/**
 * Get the neighbor of (q,r) at a given edge index (0-5).
 * Edges are numbered matching hexVertices: edge i is between vertex i and vertex (i+1)%6.
 * For pointy-top axial:
 *   0: top-right (+1,-1), 1: right (+1,0), 2: bottom-right (0,+1)
 *   3: bottom-left (-1,+1), 4: left (-1,0), 5: top-left (0,-1)
 */
const AXIAL_DIRS: [number, number][] = [
  [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
];

export function hexNeighborAt(q: number, r: number, edge: number): [number, number] {
  const [dq, dr] = AXIAL_DIRS[edge];
  return [q + dq, r + dr];
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
