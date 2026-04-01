'use client';

import type { ReactNode } from 'react';

const BASE = 'rounded-xl bg-slate-900/85 border border-slate-700/50 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden pointer-events-auto';

/** A floating card panel. Use flex-1 + min-h-0 on the parent to let it fill available space. */
export default function Card({ header, children, className }: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${BASE} ${className ?? ''}`}>
      {header && (
        <div className="p-3 pb-2 border-b border-slate-800/60 flex-shrink-0">
          {header}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {children}
      </div>
    </div>
  );
}
