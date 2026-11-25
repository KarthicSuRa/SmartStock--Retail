// /src/components/PerfTracker.tsx
// Client performance telemetry: captures TTFB, FCP, LCP, CLS, INP, duration,
// transfer sizes, and sends them via sendBeacon to /api/perf.

'use client'

import { useEffect, useRef, useState } from 'react'
import { PerformancePayload, sendPerformanceBeacon } from '@/lib/performance'
import { useStoreContext } from '@/hooks/useStoreContext'

function metric<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined
}

function firstEntry(type: string, name?: string): PerformanceEntry | undefined {
  const entries = performance.getEntriesByType(type)
  return entries.find((e) => (name ? e.name === name : true))
}

function sizeOf(entry: PerformanceEntry | undefined): number | undefined {
  if (!entry) return undefined
  const anyEntry = entry as PerformanceEntry & {
    encodedBodySize?: number; transferSize?: number; decodedBodySize?: number;
  }
  return metric(anyEntry.transferSize || anyEntry.encodedBodySize || anyEntry.decodedBodySize)
}

export function PerfTracker() {
  const { tenantId } = useStoreContext()
  const hasReported = useRef(false)

  // Route-level performance snapshot.
  useEffect(() => {
    if (hasReported.current) return
    hasReported.current = true
    const route = window.location.pathname
    const nav = firstEntry('navigation') as PerformanceNavigationTiming | undefined
    const duration = Math.max(0, performance.now() - (nav?.responseStart ?? performance.getEntriesByType('navigation')[0]?.startTime ?? 0))

    const payload: PerformancePayload = {
      route,
      tenant_id: tenantId || undefined,
      browser: true,
      is_first_view: !window.name,
      ttfb_ms: metric(nav?.responseStart),
      duration_ms: duration,
      bytes_in: sizeOf(nav),
    }
    sendPerformanceBeacon(payload)
  }, [tenantId])

  // LCP + CLS + INP via PerformanceObserver (best-effort, browser support varies).
  useEffect(() => {
    if (typeof performance === 'undefined' || typeof PerformanceObserver === 'undefined') return

    const sendSnapshot = (extras: Partial<PerformancePayload>) => {
      sendPerformanceBeacon({
        route: window.location.pathname,
        tenant_id: tenantId || undefined,
        browser: true,
        ...extras,
      })
    }

    const nav = firstEntry('navigation') as PerformanceNavigationTiming | undefined

    let lcp: number | undefined
    let cls = 0
    let inp: number | undefined

    let bytesIn = sizeOf(nav) ?? 0
    const addBytes = (value: number | undefined) => {
      if (value) bytesIn += value
    }

    const resourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        addBytes(entry.encodedBodySize || entry.transferSize)
      }
    })
    // Resource timing needs a buffer for first paint entries.
    resourceObserver.observe({ type: 'resource', entryTypes: ['resource'], buffered: true })

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          lcp = entry.startTime
        } else if (entry.entryType === 'event') {
          inp = Math.max(inp ?? 0, entry.duration ?? 0)
        } else if (entry.entryType === 'layout-shift') {
          cls += ((entry as unknown as { value?: number }).value ?? 0) as number
        }
      }
    })
    observer.observe({ type: 'largest-contentful-paint', buffered: true })
    observer.observe({ type: 'event', buffered: true } as PerformanceObserverInit)

    const paint = firstEntry('paint', 'first-contentful-paint')
    sendSnapshot({
      fcp_ms: metric((paint as PerformancePaintTiming | undefined)?.startTime),
      lcp_ms: undefined, // set by observer below
      cls: undefined,
      bytes_in: metric(sizeOf(nav)),
      is_first_view: !window.name,
    })
    // Second snapshot with LCP when available (observer is async).
    const second = setTimeout(() => sendSnapshot({
      lcp_ms: lcp,
      cls: Math.min(cls, 100),
      inp_ms: metric(inp),
      bytes_in: Math.round(bytesIn),
    }), 800)

    return () => observer.disconnect()
  }, [tenantId])

  return null
}
