// Runtime network selection. The list of available networks is baked at build time
// (see next.config.mjs → NEXT_PUBLIC_NETWORKS) and the user toggles between them
// via a chip in Sidebar; the choice persists in localStorage and a page reload
// rebuilds the ethers provider + Phaser scene from scratch.

export type NetworkConfig = {
  key: string;
  label: string;
  rpc_url: string;
  wss_url?: string;
  chain_id: number;
  router_address: string;
};

const STORAGE_KEY = 'gt:network';

function parseNetworks(): NetworkConfig[] {
  const raw = process.env.NEXT_PUBLIC_NETWORKS;
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export const NETWORKS: NetworkConfig[] = parseNetworks();

/** Default (first listed) network — used during SSR and as fallback. */
export function getDefaultNetwork(): NetworkConfig | undefined {
  return NETWORKS[0];
}

/** Currently active network. Reads localStorage in the browser; falls back to default. */
export function getActiveNetwork(): NetworkConfig | undefined {
  const def = getDefaultNetwork();
  if (typeof window === 'undefined') return def;
  try {
    const key = window.localStorage.getItem(STORAGE_KEY);
    if (!key) return def;
    return NETWORKS.find((n) => n.key === key) || def;
  } catch {
    return def;
  }
}

/** Persist the choice and reload the page so the whole engine reboots cleanly. */
export function setActiveNetwork(key: string): void {
  if (typeof window === 'undefined') return;
  if (!NETWORKS.some((n) => n.key === key)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* localStorage disabled — falling back to single reload session */
  }
  window.location.reload();
}
