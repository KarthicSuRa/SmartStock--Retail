'use client';

// /src/app/(desktop)/admin/context-intelligence/page.tsx
// SmartStock Context Intelligence V1 — Admin Context Control Tower Page

import React from 'react';
import { ContextControlTower } from '@/components/domain/ContextControlTower';

export default function ContextIntelligencePage() {
  return (
    <div className="space-y-6">
      <ContextControlTower />
    </div>
  );
}
