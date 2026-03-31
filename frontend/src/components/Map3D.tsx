'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Grid, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { Store, Pickaxe, Beer, Wheat } from 'lucide-react';

const LOC_COORDS: Record<number, { x: number; z: number; color: string; icon: any }> = {
  1: { x: -2, z: -2, color: '#fb923c', icon: <Beer size={32} /> },     // Tavern (Amber)
  2: { x:  2, z: -2, color: '#60a5fa', icon: <Pickaxe size={32} /> },  // Mine (Blue)
  3: { x: -2, z:  2, color: '#22d3ee', icon: <Store size={32} /> },    // Market (Cyan)
  4: { x:  2, z:  2, color: '#34d399', icon: <Wheat size={32} /> },    // Farm (Emerald)
};

const DEFAULT_COORD = { x: 0, z: 0, color: '#ffffff', icon: <Store size={32} /> };

// Reusable Building Mesh component
function BuildingBlock({ id, name, position, color, icon }: any) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Slight floating animation
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() + id) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* The glowing base block */}
      <mesh ref={meshRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[3, 1, 3]} />
        <meshPhysicalMaterial 
          color={color} 
          transparent={true} 
          opacity={0.3} 
          roughness={0.1} 
          transmission={0.9} 
          thickness={0.5} 
          emissive={color}
          emissiveIntensity={0.5}
        />
        <Edges scale={1.0} threshold={15} color={color} />
      </mesh>
      
      {/* Hologram Icon floating above */}
      <Html position={[0, 2, 0]} center transform style={{ pointerEvents: 'none' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: color,
          textShadow: `0 0 10px ${color}, 0 0 20px ${color}`,
        }}>
          <div style={{
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            filter: `drop-shadow(0 0 8px ${color})`
          }}>
            {icon}
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            marginTop: '8px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: `1px solid ${color}40`,
            backdropFilter: 'blur(4px)'
          }}>
            {name}
          </div>
        </div>
      </Html>
    </group>
  );
}

// Render dynamic agents on top of the blocks
function AgentsLayer() {
  const agents = useGameStore((state) => state.agents);
  const selectedAgentId = useGameStore((state) => state.selectedAgentId);
  const setSelectedAgentId = useGameStore((state) => state.setSelectedAgentId);

  return Object.values(agents).map((agent, index) => {
    const locCoords = LOC_COORDS[agent.location] || DEFAULT_COORD;
    // Jitter position slightly so multiple agents on same block don't perfectly overlap
    const offsetX = (index % 3) * 0.8 - 0.8;
    const offsetZ = Math.floor(index / 3) * 0.8 - 0.8;
    const isSelected = selectedAgentId === agent.id;

    return (
      <group key={agent.id} position={[locCoords.x + offsetX, 1.2, locCoords.z + offsetZ]}>
        {/* Simple point / coordinate marker */}
        <mesh onClick={() => setSelectedAgentId(agent.id)} position={[0, -0.5, 0]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshBasicMaterial color={isSelected ? '#60a5fa' : '#a78bfa'} />
        </mesh>
        
        {/* Ground Glow Ring indicator */}
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.5, 0]}>
          <ringGeometry args={[0.2, 0.3, 32]} />
          <meshBasicMaterial color={isSelected ? '#60a5fa' : '#a78bfa'} transparent opacity={0.6} />
        </mesh>
        
        {/* Agent Name Tag - Removed "sprite" so it ignores 3D camera zoom and stays crisp/fixed size */}
        <Html position={[0, 0, 0]} center>
          <div style={{
            color: 'white',
            background: isSelected ? 'rgba(96, 165, 250, 0.9)' : 'rgba(0,0,0,0.6)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            border: `1px solid ${isSelected ? '#bfdbfe' : '#ffffff20'}`,
            pointerEvents: 'none',
            boxShadow: `0 0 10px ${isSelected ? 'rgba(96,165,250,0.5)' : 'transparent'}`,
            transition: 'all 0.2s',
          }}>
            {agent.name}
          </div>
        </Html>
      </group>
    );
  });
}

export default function Map3D() {
  const locations = useGameStore((state) => state.locations);
  const locArray = Object.values(locations);

  return (
    <div className="w-full h-full relative" style={{ background: '#0a0e1a' }}>
      <Canvas camera={{ position: [10, 10, 10], fov: 40, near: 0.1, far: 1000 }}>
        {/* Environment Settings */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffffff" />
        <pointLight position={[-10, 10, -10]} intensity={0.5} color="#22d3ee" />
        
        {/* Orbit Controls (Isometric view strictly enforced if desired, or free-look) */}
        <OrbitControls 
          autoRotate={false} 
          enableDamping 
          dampingFactor={0.05} 
          maxPolarAngle={Math.PI / 2.2} // Prevent looking entirely under the map
          minDistance={10} 
          maxDistance={30} 
        />

        {/* Global Grid System (Cyber glowing floor) */}
        <Grid infiniteGrid fadeDistance={40} sectionColor="#1e293b" cellColor="#0f172a" sectionThickness={1.5} cellThickness={0.5} />

        {/* Dynamic Buildings */}
        {locArray.map(loc => {
          const data = LOC_COORDS[loc.id] || DEFAULT_COORD;
          return (
            <BuildingBlock
              key={loc.id}
              id={loc.id}
              name={loc.name}
              position={[data.x, 0, data.z]}
              color={data.color}
              icon={data.icon}
            />
          );
        })}

        {/* Dynamic Agents Overlay */}
        <AgentsLayer />

      </Canvas>
      {/* Global CSS to support pulse animations in Html components */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0%, 100% { transform: scale(1) translateY(0); }
          50% { transform: scale(1.05) translateY(-5px); }
        }
      `}} />
    </div>
  );
}
