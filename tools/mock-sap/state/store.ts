// /tools/mock-sap/state/store.ts
// SmartStock LiveRetail V2 — In-Memory Stateful SAP Digital Twin Database

import {
  SAPMaterial, SAPPlant, SAPStorageLocation,
  SAPVendor, SAPPurchaseOrder, SAPMaterialDocument
} from './types';

export class MockSAPDatabase {
  materials = new Map<string, SAPMaterial>();
  plants = new Map<string, SAPPlant>();
  storageLocations = new Map<string, SAPStorageLocation>();
  vendors = new Map<string, SAPVendor>();
  purchaseOrders = new Map<string, SAPPurchaseOrder>();
  materialDocuments = new Map<string, SAPMaterialDocument>();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // Master Materials
    this.materials.set('MAT-00918', { material: 'MAT-00918', description: 'San Pellegrino 750ml', baseUom: 'PC', materialType: 'FERT' });
    this.materials.set('MAT-20349', { material: 'MAT-20349', description: 'Barilla Spaghetti 500g', baseUom: 'PC', materialType: 'FERT' });
    this.materials.set('MAT-33104', { material: 'MAT-33104', description: 'Lavazza Espresso 1kg', baseUom: 'PC', materialType: 'FERT' });

    // Plants & Storage Locations
    this.plants.set('1001', { plant: '1001', name: 'Store Rotterdam Centraal', companyCode: '1000' });
    this.plants.set('1002', { plant: '1002', name: 'Store Amsterdam Flagship', companyCode: '1000' });
    this.plants.set('7001', { plant: '7001', name: 'Moerdijk Central DC', companyCode: '1000' });

    this.storageLocations.set('1001__0001', { plant: '1001', storageLocation: '0001', name: 'Shop Floor' });
    this.storageLocations.set('1002__0001', { plant: '1002', storageLocation: '0001', name: 'Shop Floor' });

    // Vendors
    this.vendors.set('VEND-4001', { supplier: 'VEND-4001', name: 'Barilla Nederland BV', purchaseBlocked: false });
    this.vendors.set('VEND-9999', { supplier: 'VEND-9999', name: 'Blocked Supplier BV', purchaseBlocked: true });
  }

  // Create STO with duplicate reference guard
  createSTO(sto: Omit<SAPPurchaseOrder, 'purchaseOrder' | 'createdAt' | 'status'>): { success: boolean; docNumber?: string; error?: string } {
    // Check duplicate
    const existing = [...this.purchaseOrders.values()].find((p) => p.yourReference === sto.yourReference);
    if (existing) {
      return { success: true, docNumber: existing.purchaseOrder };
    }

    const docNumber = `45000${Math.floor(10000 + Math.random() * 90000)}`;
    const newDoc: SAPPurchaseOrder = {
      ...sto,
      purchaseOrder: docNumber,
      createdAt: new Date().toISOString(),
      status: 'COMMITTED',
    };

    this.purchaseOrders.set(docNumber, newDoc);
    return { success: true, docNumber };
  }

  findOrderByReference(ref: string): SAPPurchaseOrder | undefined {
    return [...this.purchaseOrders.values()].find((p) => p.yourReference === ref);
  }
}
