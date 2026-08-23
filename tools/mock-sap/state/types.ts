// /tools/mock-sap/state/types.ts
// SmartStock LiveRetail V2 — Stateful Mock SAP Schema Types

export interface SAPMaterial {
  material: string;
  description: string;
  baseUom: string;
  materialType: string;
}

export interface SAPPlant {
  plant: string;
  name: string;
  companyCode: string;
}

export interface SAPStorageLocation {
  plant: string;
  storageLocation: string;
  name: string;
}

export interface SAPVendor {
  supplier: string;
  name: string;
  purchaseBlocked: boolean;
}

export interface SAPPurchaseOrder {
  purchaseOrder: string;
  purchaseOrderType: string;
  supplier?: string;
  sendingPlant?: string;
  receivingPlant: string;
  material: string;
  orderQuantity: number;
  yourReference: string;
  createdAt: string;
  status: 'CREATED' | 'COMMITTED' | 'FULFILLED';
}

export interface SAPMaterialDocument {
  materialDocument: string;
  materialDocumentYear: string;
  goodsMovementType: string;
  material: string;
  plant: string;
  storageLocation: string;
  quantityInBaseUnit: number;
  entryDate: string;
}
