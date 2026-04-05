import type { Agent, LocationData, HexData } from '../../store/useGameStore';
import type { WorldLayout, ResolvedLocation, ResolvedAgent } from './types';
import { hexToPixel, TILE_W, LOCATION_SPREAD } from './HexGrid';

const AGENT_COLOR = '#ffffff';
const AGENT_ORBIT = TILE_W * 0.35;

export function computeWorldLayout(
  agents: Record<number, Agent>,
  locations: Record<number, LocationData>,
  hexes: Record<string, HexData>,
): WorldLayout {
  const locArray = Object.values(locations);
  const resolvedLocations: ResolvedLocation[] = [];

  // Build locationId → HexData lookup
  const locToHex: Record<number, HexData> = {};
  for (const h of Object.values(hexes)) {
    locToHex[h.locationId] = h;
  }

  locArray.forEach((loc) => {
    const hex = locToHex[loc.id];
    // Only show locations that are tied to an agent's hex
    if (!hex || hex.ownerId <= 0) return;

    const q = loc.q * LOCATION_SPREAD;
    const r = loc.r * LOCATION_SPREAD;

    resolvedLocations.push({
      id: loc.id,
      name: loc.name,
      ownerId: hex.ownerId,
      ownerName: agents[hex.ownerId]?.name ?? `#${hex.ownerId}`,
      center: hexToPixel(q, r),
      centerHex: { q, r },
    });
  });

  const agentsByLoc: Record<number, Agent[]> = {};
  for (const agent of Object.values(agents)) {
    if (!agentsByLoc[agent.location]) agentsByLoc[agent.location] = [];
    agentsByLoc[agent.location].push(agent);
  }

  const resolvedAgents: ResolvedAgent[] = [];
  for (const [locIdStr, locAgents] of Object.entries(agentsByLoc)) {
    const locId = Number(locIdStr);
    const loc = resolvedLocations.find((l) => l.id === locId);
    if (!loc) continue;

    const n = locAgents.length;
    locAgents.forEach((agent, idx) => {
      let dx = 0;
      let dy = 0;
      if (n > 1) {
        const angle = (2 * Math.PI * idx) / n - Math.PI / 2;
        dx = Math.cos(angle) * AGENT_ORBIT;
        dy = Math.sin(angle) * AGENT_ORBIT;
      }
      resolvedAgents.push({
        id: agent.id,
        name: agent.name,
        locationId: locId,
        color: AGENT_COLOR,
        position: { x: loc.center.x + dx, y: loc.center.y + dy },
      });
    });
  }

  // Build hex ownership map: "q,r" → ownerId
  const hexOwners = new Map<string, number>();
  for (const h of Object.values(hexes)) {
    if (h.ownerId > 0) {
      hexOwners.set(`${h.q},${h.r}`, h.ownerId);
    }
  }

  return { locations: resolvedLocations, agents: resolvedAgents, hexOwners };
}
