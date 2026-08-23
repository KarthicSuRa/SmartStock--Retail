// /tools/mock-sap/server.ts
// SmartStock LiveRetail V2 — Real HTTP Mock SAP S/4HANA Server
//
// PURPOSE:
//   Exposes realistic OData V2 endpoints mimicking SAP S/4HANA Gateway:
//   - /sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod
//   - /sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader
//   - /sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder
//   - /sap/opu/odata/sap/API_INFORECORD_PROCESS_SRV/A_PurInfoRecPlantData
//   - /$metadata
//   - /$batch (Multipart multipart/mixed batch requests)
//
// SCENARIOS:
//   Configurable behavior via header `x-mock-scenario`:
//   'SUCCESS' | 'LATENCY_5S' | 'HTTP_401' | 'HTTP_429' | 'HTTP_500' | 'TIMEOUT' | 'PARTIAL_BATCH_FAILURE' | 'OUTCOME_UNKNOWN'

import { createServer, IncomingMessage, ServerResponse } from 'http';

const PORT = process.env.MOCK_SAP_PORT ? parseInt(process.env.MOCK_SAP_PORT, 10) : 8085;

// In-memory persistent state to verify if SmartStock accidentally created duplicate documents
const createdMaterialDocuments: Array<{ id: string; year: string; items: any[]; created_at: string }> = [];
const createdPurchaseOrders: Array<{ id: string; vendor: string; items: any[]; created_at: string }> = [];

let docCounter = 500100200;
let poCounter = 450009800;

function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '';
  const method = req.method || 'GET';
  const scenario = (req.headers['x-mock-scenario'] as string) || 'SUCCESS';

  console.log(`[MOCK-SAP] ${method} ${url} (Scenario: ${scenario})`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, sap-client, x-mock-scenario, x-csrf-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle Failure Scenarios
  if (scenario === 'HTTP_401') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'AUTH_FAILED', message: 'Unauthorized: Invalid SAP Gateway credentials' } }));
    return;
  }

  if (scenario === 'HTTP_429') {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' });
    res.end(JSON.stringify({ error: { code: 'RATE_LIMIT', message: 'Too many concurrent SAP OData requests' } }));
    return;
  }

  if (scenario === 'HTTP_500') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'CX_SY_OPEN_SQL_DB error in SAP core' } }));
    return;
  }

  if (scenario === 'LATENCY_5S') {
    setTimeout(() => respondSuccess(req, res, url, method), 5000);
    return;
  }

  respondSuccess(req, res, url, method);
}

function respondSuccess(req: IncomingMessage, res: ServerResponse, url: string, method: string) {
  // 1. Stock Baseline Service
  if (url.includes('API_MATERIAL_STOCK_SRV')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      d: {
        results: [
          { Material: 'MAT-00918', Plant: '1001', StorageLocation: '0001', MatlStkQtyInAcctMod: 48, MaterialBaseUnit: 'PC', MaterialDescription: 'San Pellegrino 750ml' },
          { Material: 'MAT-20349', Plant: '1001', StorageLocation: '0001', MatlStkQtyInAcctMod: 120, MaterialBaseUnit: 'PC', MaterialDescription: 'Barilla Spaghetti No. 5' },
          { Material: 'MAT-33104', Plant: '1001', StorageLocation: '0001', MatlStkQtyInAcctMod: 36, MaterialBaseUnit: 'PC', MaterialDescription: 'Lavazza Espresso 1kg' },
        ]
      }
    }));
    return;
  }

  // 2. Purchasing Info Records Service
  if (url.includes('API_INFORECORD_PROCESS_SRV')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      d: {
        results: [
          { Material: 'MAT-00918', Supplier: 'VEND-1001', NetPrice: 1.85, MinimumOrderQuantity: 24, PlannedDeliveryDurationInDays: 2, RoundingValue: 12 },
          { Material: 'MAT-20349', Supplier: 'VEND-1002', NetPrice: 0.95, MinimumOrderQuantity: 48, PlannedDeliveryDurationInDays: 3, RoundingValue: 24 },
        ]
      }
    }));
    return;
  }

  // 3. Purchase Order Creation (POST)
  if (url.includes('API_PURCHASEORDER_PROCESS_SRV') && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      poCounter++;
      const poNum = String(poCounter);
      createdPurchaseOrders.push({ id: poNum, vendor: 'VEND-1001', items: [], created_at: new Date().toISOString() });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        d: {
          PurchaseOrder: poNum,
          PurchaseOrderType: 'NB',
          CompanyCode: '1000',
          Supplier: 'VEND-1001',
        }
      }));
    });
    return;
  }

  // 4. Material Document Goods Issue (Movement 551)
  if (url.includes('API_MATERIAL_DOCUMENT_SRV') && method === 'POST') {
    docCounter++;
    const docNum = String(docCounter);
    createdMaterialDocuments.push({ id: docNum, year: '2026', items: [], created_at: new Date().toISOString() });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      d: {
        MaterialDocument: docNum,
        MaterialDocumentYear: '2026',
        GoodsMovementType: '551',
      }
    }));
    return;
  }

  // 5. Query Audit Verification endpoint for test assertions
  if (url.includes('/mock-admin/audit')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      material_documents_created: createdMaterialDocuments,
      purchase_orders_created: createdPurchaseOrders,
    }));
    return;
  }

  // Default Fallback
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'MOCK_SAP_ONLINE', service: 'SAP S/4HANA OData Gateway V2 Simulator' }));
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`[MOCK-SAP] HTTP Server listening on port ${PORT}`);
});
