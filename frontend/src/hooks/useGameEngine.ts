import { useEffect } from 'react';
import { WebSocketProvider } from 'ethers';
import { useGameStore } from '../store/useGameStore';
import { resolveContracts, fullSync, subscribeEvents } from '../chain';

const WSS_URL      = process.env.NEXT_PUBLIC_WSS_URL       || 'ws://127.0.0.1:8545';
const ROUTER_ADDR  = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000';

export function useGameEngine() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let provider: WebSocketProvider | undefined;

    const start = async () => {
      provider = new WebSocketProvider(WSS_URL);
      const contracts = await resolveContracts(provider, ROUTER_ADDR);

      // Initial full sync — set everything in one batch so Phaser sees a consistent snapshot
      const data = await fullSync(contracts);
      useGameStore.setState({
        agents: data.agents,
        locations: data.locations,
        memories: data.memories,
        locationBoards: data.locationBoards,
        inbox: data.inbox,
      });

      // Subscribe to events for real-time updates
      cleanup = subscribeEvents(contracts);

      console.log('[WSS] Connected and subscribed to contract events');
    };

    start().catch((err) => console.error('[WSS] Connection error:', err));

    return () => {
      cleanup?.();
      provider?.destroy();
    };
  }, []);
}
