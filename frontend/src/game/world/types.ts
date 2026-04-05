/** A resolved position in 2D world-space (pixels). */
export interface WorldPoint {
  x: number;
  y: number;
}

/** Layout-resolved location (= claimed hex). */
export interface ResolvedLocation {
  id: number;
  name: string;
  ownerId: number;   // agent who owns this hex, 0 = unclaimed
  ownerName: string;
  center: WorldPoint;
  centerHex: { q: number; r: number };
}

/** Layout-resolved agent with its world position. */
export interface ResolvedAgent {
  id: number;
  name: string;
  locationId: number;
  color: string;
  position: WorldPoint;
}

/**
 * The complete computed layout of the game world.
 * Any renderer consumes this — no layout math in the renderer.
 */
export interface WorldLayout {
  locations: ResolvedLocation[];
  agents: ResolvedAgent[];
  /** Map of "q,r" → ownerId for all owned hexes (for territory coloring) */
  hexOwners: Map<string, number>;
}

/** Camera target for fly-to. Renderer translates to its own camera system. */
export interface CameraTarget {
  point: WorldPoint;
  zoom: 'far' | 'close';
}
