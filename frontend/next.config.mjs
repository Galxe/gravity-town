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

if (!existsSync(configPath)) {
  throw new Error(`Frontend config not found: ${configPath}`);
}

const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));

// For localhost, auto-load router address from deployed-addresses.json if not set
let routerAddress = cfg.router_address;
if (!routerAddress) {
  const deployedPath = resolve(__dirname, '../deployed-addresses.json');
  if (existsSync(deployedPath)) {
    const deployed = JSON.parse(readFileSync(deployedPath, 'utf-8'));
    routerAddress = deployed.routerAddress || deployed.agentRegistryAddress || '0x0000000000000000000000000000000000000000';
    console.log(`[next.config] loaded router address from deployed-addresses.json: ${routerAddress}`);
  } else {
    routerAddress = '0x0000000000000000000000000000000000000000';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_RPC_URL: cfg.rpc_url,
    NEXT_PUBLIC_ROUTER_ADDRESS: routerAddress,
  },
};

export default nextConfig;
