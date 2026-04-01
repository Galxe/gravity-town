'use client';

import { useEffect, useRef } from 'react';

export default function PhaserMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // Dynamic import avoids SSR — Phaser requires window/document
    import('../phaser/PhaserGame').then(({ createPhaserGame }) => {
      if (containerRef.current && !gameRef.current) {
        gameRef.current = createPhaserGame(containerRef.current);
      }
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
