'use client';

// /src/app/(desktop)/admin/decision-governance/page.tsx
// SmartStock Decision Intelligence V1 — Admin Decision Governance Page

import React from 'react';
import { DecisionIntelligenceControlTower } from '@/components/domain/DecisionIntelligenceControlTower';

export default function DecisionGovernancePage() {
  return (
    <div className="space-y-6">
      <DecisionIntelligenceControlTower />
    </div>
  );
}
