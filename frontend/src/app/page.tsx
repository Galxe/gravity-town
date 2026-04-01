'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import HUD from '@/components/HUD';
import Sidebar from '@/components/Sidebar';
import { useGameEngine } from '@/hooks/useGameEngine';

const PhaserMap = dynamic(() => import('@/components/PhaserMap'), { ssr: false });

export default function Home() {
  useGameEngine();

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#080c16] relative">
      <Suspense fallback={<div className="text-white text-center mt-20 font-mono animate-pulse">Initializing Game Engine...</div>}>
        <div className="absolute inset-0">
          <PhaserMap />
        </div>
      </Suspense>
      <Sidebar />
      <HUD />
    </main>
  );
}
