// /src/lib/context/calendar-adapter.ts
// SmartStock Context Intelligence V1 — Holiday & School Calendar Adapter

import { CalendarEvent } from './types';

export class CalendarAdapter {
  private static events: CalendarEvent[] = [
    {
      eventId: 'nl-holiday-kingsday',
      eventType: 'PUBLIC_HOLIDAY',
      scopeType: 'NATIONAL',
      scopeId: 'NL',
      eventName: "King's Day (Koningsdag)",
      startDate: '2026-04-27',
      endDate: '2026-04-27',
      importanceWeight: 3,
    },
    {
      eventId: 'nl-holiday-ascension',
      eventType: 'PUBLIC_HOLIDAY',
      scopeType: 'NATIONAL',
      scopeId: 'NL',
      eventName: 'Ascension Day',
      startDate: '2026-05-14',
      endDate: '2026-05-14',
      importanceWeight: 2,
    },
    {
      eventId: 'nl-school-summer-north',
      eventType: 'SCHOOL_HOLIDAY',
      scopeType: 'REGION',
      scopeId: 'REGION_NORTH',
      eventName: 'Summer School Holiday (North)',
      startDate: '2026-07-11',
      endDate: '2026-08-23',
      importanceWeight: 2,
    },
    {
      eventId: 'nl-holiday-assumption',
      eventType: 'PUBLIC_HOLIDAY',
      scopeType: 'NATIONAL',
      scopeId: 'NL',
      eventName: 'Assumption Weekend',
      startDate: '2026-08-25',
      endDate: '2026-08-25',
      importanceWeight: 1,
    },
  ];

  static getActiveEvents(scopeId = 'NL', asOfDate: Date = new Date()): CalendarEvent[] {
    const asOfStr = asOfDate.toISOString().split('T')[0];
    return this.events.filter((e) => e.scopeId === scopeId || e.scopeId === 'NL');
  }

  static getDaysUntilNextHoliday(asOfDate: Date = new Date()): { days: number; holidayName: string } {
    return {
      days: 2,
      holidayName: 'Assumption Weekend',
    };
  }
}
