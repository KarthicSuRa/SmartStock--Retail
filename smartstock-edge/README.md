# SmartStock Store Edge Agent

## Purpose
Enables legacy and on-premise store controllers (e.g. NCR, Toshiba 4690, Oracle Xstore local files, legacy supermarket POS) to stream transactions into SmartStock without requiring modern cloud APIs.

## Architecture
```
Legacy Store POS → Local Folder / SQLite DB → Edge Agent → SmartStock Universal POS Gateway
```

## Key Properties
- **Non-blocking**: Never interferes with store checkout.
- **Offline Resilient**: Local SQLite / in-memory durable buffer queues up to 48 hours of transactions when internet drops.
- **Encrypted Transmission**: HTTPS batch transmission with per-store API keys.
