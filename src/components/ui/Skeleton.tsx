'use client';

// /src/components/ui/Skeleton.tsx
// SmartStock Experience V1 — Layout-Preserving Skeleton Component

import React from 'react';

export interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full', count = 1 }) => {
  if (count === 1) {
    return <div className={`animate-pulse bg-[#EAECF0] rounded-[4px] ${className}`} />;
  }

  return (
    <div className="space-y-2 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`animate-pulse bg-[#EAECF0] rounded-[4px] ${className}`} />
      ))}
    </div>
  );
};
