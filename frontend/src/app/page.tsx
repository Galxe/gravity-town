'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import HUD from '@/components/HUD';
import { useGameEngine } from '@/hooks/useGameEngine';

// Dynamically import Map3D with SSR disabled since it uses WebGL/Canvas
const Map3D = dynamic(() => import('@/components/Map3D'), { ssr: false });

export default function Home() {
  // Start polling game state from the RPC
  useGameEngine();

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#0a0e1a] relative">
      <Suspense fallback={<div className="text-white text-center mt-20 font-mono animate-pulse">Initializing WebGL Engine...</div>}>
        <div className="absolute inset-0">
          <Map3D />
        </div>
      </Suspense>
      <HUD />
    </main>
  );
}
