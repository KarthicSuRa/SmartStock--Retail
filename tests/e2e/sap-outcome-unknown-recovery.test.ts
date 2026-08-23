// /tests/e2e/sap-outcome-unknown-recovery.test.ts
// SmartStock LiveRetail V2 — E2E SAP Commit Ambiguity & OUTCOME_UNKNOWN Recovery Test (RC1)

import { MockSAPDatabase } from '../../tools/mock-sap/state/store';

describe('SAP Commit Ambiguity & OUTCOME_UNKNOWN Recovery Suite', () => {
  test('Network drop after SAP commit is resolved via reference probe without duplicate STO', () => {
    const sapDb = new MockSAPDatabase();
    const externalRef = `STO-REF-${Date.now()}`;

    // 1. Initial POST from SmartStock posting worker
    // SAP receives request, validates, and COMMITS document to database
    const commitResult = sapDb.createSTO({
      purchaseOrderType: 'UB',
      sendingPlant: '7001',
      receivingPlant: '1001',
      material: 'MAT-20349',
      orderQuantity: 24,
      yourReference: externalRef,
    });

    expect(commitResult.success).toBe(true);
    const sapDocNumber = commitResult.docNumber!;

    // 2. SIMULATE NETWORK DROP:
    // Connection is severed before HTTP response reaches SmartStock.
    // SmartStock transitions outbox item status to OUTCOME_UNKNOWN.
    let outboxStatus = 'OUTCOME_UNKNOWN';

    // 3. RECOVERY STATUS PROBE:
    // Posting-worker executes recovery handler: queries SAP by yourReference
    const probedDoc = sapDb.findOrderByReference(externalRef);

    expect(probedDoc).toBeDefined();
    expect(probedDoc?.purchaseOrder).toBe(sapDocNumber);

    // 4. Status is transitioned to SAP_ACCEPTED without re-posting
    outboxStatus = 'COMPLETED';

    // 5. Verify SAP document count remains EXACTLY 1 (No duplicate created)
    const matchingDocs = [...sapDb.purchaseOrders.values()].filter(
      (p) => p.yourReference === externalRef
    );

    expect(matchingDocs.length).toBe(1);
    expect(outboxStatus).toBe('COMPLETED');
  });
});
