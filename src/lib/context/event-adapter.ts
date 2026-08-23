// /src/lib/context/event-adapter.ts
// SmartStock Context Intelligence V1 — Local Event Distance-Weighted Impact Scorer

import { LocalEvent } from './types';

export class LocalEventAdapter {
  private static mockEvents: LocalEvent[] = [
    {
      eventId: 'evt-ajax-match',
      storeId: '1001', // Near Amsterdam Central & metro lines
      eventName: 'Eredivisie: AFC Ajax vs Feyenoord',
      venueName: 'Johan Cruijff Arena',
      distanceKm: 1.2,
      expectedAttendance: 54000,
      category: 'SPORTS',
      impactScore: 0.88,
      startTime: '2026-08-23T18:00:00Z',
      endTime: '2026-08-23T22:30:00Z',
    },
    {
      eventId: 'evt-rotterdam-marathon',
      storeId: '1003',
      eventName: 'City Running Grand Prix',
      venueName: 'Coolsingel Boulevard',
      distanceKm: 0.4,
      expectedAttendance: 25000,
      category: 'SPORTS',
      impactScore: 0.92,
      startTime: '2026-08-24T09:00:00Z',
      endTime: '2026-08-24T16:00:00Z',
    },
  ];

  static calculateImpactScore(attendance: number, distanceKm: number): number {
    const rawScore = attendance / (10000.0 * Math.max(distanceKm * distanceKm, 0.5));
    return Number(Math.min(Math.max(rawScore / 4.0, 0.1), 1.0).toFixed(2));
  }

  static getNearbyEvents(storeId: string): LocalEvent[] {
    return this.mockEvents.filter((e) => e.storeId === storeId);
  }
}
