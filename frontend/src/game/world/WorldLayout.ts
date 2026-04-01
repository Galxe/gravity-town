import type { Agent, LocationData } from '../../store/useGameStore';
import type { WorldLayout, ResolvedLocation, ResolvedAgent } from './types';
import { hexToPixel, TILE_W, LOCATION_SPREAD } from './HexGrid';

const AGENT_COLOR = '#ffffff';

/** Agent orbit radius in pixels. */
const AGENT_ORBIT = TILE_W * 0.35;

export function computeWorldLayout(
  agents: Record<number, Agent>,
  locations: Record<number, LocationData>,
): WorldLayout {
  const locArray = Object.values(locations);
  const resolvedLocations: ResolvedLocation[] = [];

  locArray.forEach((loc) => {
    const q = loc.q * LOCATION_SPREAD;
    const r = loc.r * LOCATION_SPREAD;

    resolvedLocations.push({
      id: loc.id,
      name: loc.name,
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

  return { locations: resolvedLocations, agents: resolvedAgents };
}
