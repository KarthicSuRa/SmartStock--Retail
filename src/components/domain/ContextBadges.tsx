'use client';

// /src/components/domain/ContextBadges.tsx
// SmartStock Context Intelligence V1 — Visual Context Signal Badges

import React from 'react';
import { ContextFeatureSnapshot } from '@/lib/context/types';
import { Sun, CloudRain, Tag, Calendar, Trophy, Sparkles } from 'lucide-react';

export const ContextBadges: React.FC<{
  context: ContextFeatureSnapshot;
  className?: string;
}> = ({ context, className = '' }) => {
  return (
    <div className={`flex flex-wrap items-center gap-2 font-mono text-[11px] ${className}`}>
      {/* Weather Badge */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FEF6EE] text-[#B54708] border border-[#FEDF89]">
        {context.isRainExpected ? (
          <CloudRain className="w-3.5 h-3.5 text-[#2E90FA]" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-[#F79009]" />
        )}
        <span className="font-semibold">
          {context.temperatureForecastC}°C{' '}
          {context.temperatureDeltaFromNormC > 0 && `(+${context.temperatureDeltaFromNormC}°C Hot)`}
        </span>
      </div>

      {/* Promotion Badge */}
      {context.isOnPromotion && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FDF2FA] text-[#C11574] border border-[#FCCEEE]">
          <Tag className="w-3.5 h-3.5" />
          <span className="font-semibold">{context.discountPercentage}% Promo Active</span>
        </div>
      )}

      {/* Holiday Proximity Badge */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#F0F9FF] text-[#026AA2] border border-[#B9E6FE]">
        <Calendar className="w-3.5 h-3.5" />
        <span className="font-semibold">
          {context.daysUntilHoliday === 0
            ? 'Holiday Today'
            : `${context.daysUntilHoliday}d to ${context.holidayName}`}
        </span>
      </div>

      {/* Local Event Badge */}
      {context.hasMajorEventNearby && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#EDFDF5] text-[#027A48] border border-[#A6F4C5]">
          <Trophy className="w-3.5 h-3.5 text-[#12B76A]" />
          <span className="font-semibold">
            {context.nearbyEventName} ({context.eventDistanceKm}km)
          </span>
        </div>
      )}

      {/* Combined Demand Multiplier Indicator */}
      {context.categoryContextDemandMultiplier > 1.0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] border border-[#14706B]/20 font-bold">
          <Sparkles className="w-3 h-3" />
          <span>{context.categoryContextDemandMultiplier}x Demand Surge</span>
        </div>
      )}
    </div>
  );
};
