'use client';

import type { ReactNode } from 'react';

/** A floating card panel styled as a cartoon parchment scroll. */
export default function Card({ header, children, className }: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`
      rounded-cartoon bg-parchment/90 border-[3px] border-wood-dark/70
      shadow-cartoon backdrop-blur-sm flex flex-col overflow-hidden pointer-events-auto
      ${className ?? ''}
    `}>
      {header && (
        <div className="px-3 py-2 border-b-2 border-wood/30 bg-parchment-dark/60 flex-shrink-0">
          {header}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 cartoon-scroll">
        {children}
      </div>
    </div>
  );
}
