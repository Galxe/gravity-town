import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// APP_CONFIG can be:
//   - a bare name like "localhost" → loads config/<name>.json
//   - an absolute or relative path to a JSON file → loads it directly
const configName = process.env.APP_CONFIG || 'localhost';
const isPath = configName.startsWith('/') || configName.startsWith('.') || configName.endsWith('.json');
const configPath = isPath
  ? resolve(configName)
  : resolve(__dirname, `config/${configName}.json`);

// If config file doesn't exist, fall back to localhost defaults
const cfg = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf-8'))
  : { rpc_url: 'http://127.0.0.1:8545' };

// Auto-load router address from deployed-addresses.json if not in config
let routerAddress = cfg.router_address;
if (!routerAddress) {
  const deployedPath = resolve(__dirname, '../deployed-addresses.json');
  if (existsSync(deployedPath)) {
    const deployed = JSON.parse(readFileSync(deployedPath, 'utf-8'));
    routerAddress = deployed.routerAddress || '0x0000000000000000000000000000000000000000';
    console.log(`[next.config] loaded router address from deployed-addresses.json: ${routerAddress}`);
  } else {
    routerAddress = '0x0000000000000000000000000000000000000000';
  }
}

// Bake the list of selectable networks into the client bundle so the UI can
// flip between them at runtime (see src/lib/networks.ts).
// The first entry is the default on first visit. Missing config files are skipped.
const NETWORK_FILES = [
  { key: 'mainnet', label: 'Mainnet', file: 'gravity-mainnet.json' },
  { key: 'testnet', label: 'Testnet', file: 'gravity-testnet.json' },
];
const networks = NETWORK_FILES.map(({ key, label, file }) => {
  // Prefer a local override (gitignored *.json), fall back to the committed *.example.json.
  const localPath = resolve(__dirname, `config/${file}`);
  const examplePath = resolve(__dirname, `config/${file.replace(/\.json$/, '.example.json')}`);
  const path = existsSync(localPath) ? localPath : existsSync(examplePath) ? examplePath : null;
  if (!path) return null;
  const c = JSON.parse(readFileSync(path, 'utf-8'));
  if (!c.rpc_url || !c.router_address || !c.chain_id) return null;
  return {
    key,
    label,
    rpc_url: c.rpc_url,
    wss_url: c.wss_url || '',
    chain_id: Number(c.chain_id),
    router_address: c.router_address,
  };
}).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by frontend/Dockerfile (COPY --from=builder /app/out). Without this,
  // `next build` emits .next/ instead of out/, the Docker build fails on the COPY,
  // and the frontend-image workflow can't push a new tag to ghcr. PR #25
  // accidentally dropped this line; restoring here.
  output: 'export',
  env: {
    NEXT_PUBLIC_RPC_URL: cfg.rpc_url,
    NEXT_PUBLIC_WSS_URL: cfg.wss_url || '',
    NEXT_PUBLIC_ROUTER_ADDRESS: routerAddress,
    NEXT_PUBLIC_CHAIN_ID: cfg.chain_id ? String(cfg.chain_id) : '',
    NEXT_PUBLIC_NETWORKS: JSON.stringify(networks),
  },
};

export default nextConfig;
