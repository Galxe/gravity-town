// Resolves all contract instances via Router, supports both HTTP and WSS providers
import { Contract, WebSocketProvider, JsonRpcProvider } from 'ethers';
import {
  ROUTER_ABI, REGISTRY_ABI, AGENT_LEDGER_ABI,
  LOCATION_LEDGER_ABI, INBOX_LEDGER_ABI, GAME_ENGINE_ABI,
} from './abis';

export interface Contracts {
  registry: Contract;
  agentLedger: Contract;
  locationLedger: Contract;
  inboxLedger: Contract;
  gameEngine: Contract;
}

export async function resolveContracts(
  provider: WebSocketProvider | JsonRpcProvider,
  routerAddress: string,
): Promise<Contracts> {
  const router = new Contract(routerAddress, ROUTER_ABI, provider);
  const [registryAddr, agentLedgerAddr, locationLedgerAddr, inboxLedgerAddr, engineAddr] =
    await router.getAddresses();

  return {
    registry: new Contract(registryAddr, REGISTRY_ABI, provider),
    agentLedger: new Contract(agentLedgerAddr, AGENT_LEDGER_ABI, provider),
    locationLedger: new Contract(locationLedgerAddr, LOCATION_LEDGER_ABI, provider),
    inboxLedger: new Contract(inboxLedgerAddr, INBOX_LEDGER_ABI, provider),
    gameEngine: new Contract(engineAddr, GAME_ENGINE_ABI, provider),
  };
}
