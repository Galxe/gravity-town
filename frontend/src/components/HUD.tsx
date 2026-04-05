'use client';

import { useGameStore } from '../store/useGameStore';
import { Navigation } from 'lucide-react';
import AgentDetail from './AgentDetail';
import LocationDetail from './LocationDetail';

export default function HUD() {
  const agents = useGameStore((s) => s.agents);
  const locations = useGameStore((s) => s.locations);
  const locationBoards = useGameStore((s) => s.locationBoards);
  const memories = useGameStore((s) => s.memories);
  const inbox = useGameStore((s) => s.inbox);
  const selectedEntity = useGameStore((s) => s.selectedEntity);

  const selectedAgent = selectedEntity?.type === 'agent' ? agents[selectedEntity.id] : null;
  const selectedLocation = selectedEntity?.type === 'location' ? locations[selectedEntity.id] : null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 p-3 flex flex-col gap-3 pointer-events-none" style={{ zIndex: 10 }}>
      {selectedAgent ? (
        <AgentDetail
          agent={selectedAgent}
          locationName={locations[selectedAgent.location]?.name || 'Unknown'}
          memories={memories[selectedAgent.id]}
          inbox={inbox[selectedAgent.id]}
          agents={agents}
        />
      ) : selectedLocation ? (
        <LocationDetail
          location={selectedLocation}
          board={locationBoards[selectedLocation.id]}
          agents={agents}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center pointer-events-none">
          <div className="text-ink-faded opacity-60 text-center">
            <Navigation size={28} className="mx-auto mb-2 animate-bounce" />
            <p className="text-xs font-cartoon">Click an agent or location</p>
          </div>
        </div>
      )}
    </div>
  );
}
