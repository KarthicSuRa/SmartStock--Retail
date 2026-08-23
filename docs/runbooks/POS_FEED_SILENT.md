# Runbook: POS_FEED_SILENT

## Symptoms
A retail store has not transmitted any POS inventory events for over 15 minutes during active store trading hours.

## Likely Causes
1. Store local area network (LAN/WAN) outage.
2. POS middleware terminal service crashed or stopped.
3. Edge Function authorization token revoked or expired.
4. POS terminal clock drift > 24 hours causing event quarantine.

## Diagnostic Steps
1. Query silent stores telemetry view:
   ```sql
   SELECT * FROM v_silent_stores WHERE location_id = '<storeId>';
   ```
2. Check last event received:
   ```sql
   SELECT MAX(received_timestamp), MAX(business_timestamp)
   FROM inventory_events WHERE location_id = '<storeId>';
   ```
3. Check `inventory_events` for quarantined records from this location:
   ```sql
   SELECT * FROM inventory_events WHERE location_id = '<storeId>' AND quarantined = true;
   ```
4. Verify Supabase `pos-webhook` function health in edge logs.

## Safe Recovery Procedure
1. If store network is restored, POS will transmit accumulated offline buffer. Ingestion gateway sequence evaluation will detect sequence jump and process backlog in order.
2. If token expired, rotate API credentials via Admin Console.
3. If events were quarantined due to clock skew, review and release them in `admin/quarantine`.

## What NOT to Do
- DO NOT manually insert estimated sale events into `inventory_events`.
- DO NOT edit `inventory_position.estimated_on_hand` directly.
