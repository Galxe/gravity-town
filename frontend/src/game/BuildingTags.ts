/**
 * Maps location names/keywords to Kenney medieval building tiles.
 * Fallback: medieval_house.
 */
const TAG_MAP: Record<string, string> = {
  tavern:     'medieval_smallCastle',
  mine:       'medieval_mine',
  market:     'medieval_blacksmith',
  farm:       'medieval_farm',
  church:     'medieval_church',
  tower:      'medieval_tower',
  windmill:   'medieval_windmill',
  lumber:     'medieval_lumber',
  cabin:      'medieval_cabin',
  house:      'medieval_house',
};

const FALLBACK = 'medieval_house';

/** All building texture keys for preloading. */
export function allBuildingTextureKeys(): { key: string; file: string }[] {
  const seen = new Set<string>();
  const result: { key: string; file: string }[] = [];
  for (const tile of Object.values(TAG_MAP)) {
    if (seen.has(tile)) continue;
    seen.add(tile);
    result.push({ key: `building_${tile}`, file: `/tiles/buildings/${tile}.png` });
  }
  return result;
}

/** Resolve a location name to a building texture key. */
export function buildingKeyForLocation(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, tile] of Object.entries(TAG_MAP)) {
    if (lower.includes(keyword)) return `building_${tile}`;
  }
  return `building_${FALLBACK}`;
}
