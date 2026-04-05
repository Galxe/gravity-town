import { useGameStore } from '../store/useGameStore';
import { computeWorldLayout } from '../game/world/WorldLayout';
import type { HexMapScene } from './scenes/HexMapScene';

export class StoreBridge {
  private unsubLayout: () => void;
  private unsubSelection: () => void;
  private unsubFocus: () => void;

  constructor(private scene: HexMapScene) {
    const state = useGameStore.getState();
    const layout = computeWorldLayout(state.agents, state.locations, state.hexes);
    this.scene.applyLayout(layout);
    this.scene.highlightEntity(state.selectedEntity);

    let prevAgents = state.agents;
    let prevLocations = state.locations;
    let prevHexes = state.hexes;
    this.unsubLayout = useGameStore.subscribe((s) => {
      if (s.agents !== prevAgents || s.locations !== prevLocations || s.hexes !== prevHexes) {
        prevAgents = s.agents;
        prevLocations = s.locations;
        prevHexes = s.hexes;
        const newLayout = computeWorldLayout(s.agents, s.locations, s.hexes);
        this.scene.applyLayout(newLayout);
      }
    });

    let prevSelected = state.selectedEntity;
    this.unsubSelection = useGameStore.subscribe((s) => {
      if (s.selectedEntity !== prevSelected) {
        prevSelected = s.selectedEntity;
        this.scene.highlightEntity(s.selectedEntity);
      }
    });

    this.unsubFocus = useGameStore.subscribe((s) => {
      if (s.focusTarget) {
        this.scene.cameraController.flyTo(s.focusTarget);
        useGameStore.getState().setFocusTarget(null);
      }
    });
  }

  static selectEntity(entity: { type: 'agent' | 'location'; id: number } | null) {
    useGameStore.getState().setSelectedEntity(entity);
  }

  static hoverEntity(entity: { type: 'agent' | 'location'; id: number } | null) {
    useGameStore.getState().setHoveredEntity(entity);
  }

  static focusOn(x: number, y: number, zoom: 'far' | 'close') {
    useGameStore.getState().setFocusTarget({ x, y, zoom });
  }

  destroy() {
    this.unsubLayout();
    this.unsubSelection();
    this.unsubFocus();
  }
}
