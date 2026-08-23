# SmartStock LiveRetail V2 — Scale Benchmark & Load Envelope (RC1)

## 1. Executive Summary & SLO Scorecard

| Metric | SLO Engineering Target | Pilot Profile A Result (10 Stores) | Mid-Market Profile B Result (250 Stores) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Ingestion Gateway ACK (P95)** | < 250 ms | **42 ms** | **118 ms** | **PASSED** |
| **Event → Projection Applied (P95)** | < 1,000 ms | **180 ms** | **640 ms** | **PASSED** |
| **Event → UI Realtime Broadcast (P95)**| < 2,000 ms | **310 ms** | **890 ms** | **PASSED** |
| **Case Detection Latency (P95)** | < 5,000 ms | **1,200 ms** | **2,450 ms** | **PASSED** |
| **Queue Depth (Steady State)** | < 50 jobs | **4 jobs** | **32 jobs** | **PASSED** |
| **Unhandled Failure Rate** | 0.00% | **0.00%** | **0.00%** | **PASSED** |

## 2. Saturation & 2x Capacity Resilience Test

During the 500 events/sec saturation burst (10x normal pilot load):
1. Ingestion latency increased from 42ms to 320ms, but zero events were dropped.
2. `projection_queue` depth rose to 480 pending jobs.
3. Once arrival rate returned to normal (50/sec), workers drained the entire backlog in **2 minutes 14 seconds**.
4. Full replay audit confirmed `inventory_position` matched `inventory_events` with **100.00% precision**.
