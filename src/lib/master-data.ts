'use client';

// /src/lib/master-data.ts
// SmartStock — Org structure, merchandise category hierarchy & back-store bin master data.
// Mirrors DB tables in migration 73 (SAP Retail aligned: BUKRS / WERKS / VKORG / VTWEG / EKORG / EKGRP / LGNUM / MATKL).

import { createPersistentStore } from './local-store';

// ───────────────────────── ORG STRUCTURE ─────────────────────────
export interface CompanyCode { code: string; name: string; country: string; currency: string; fiscalVariant: string }
export interface SalesOrg { code: string; name: string; companyCode: string; channels: string[] }
export interface DistributionChannel { code: string; name: string; description: string }
export interface PurchaseOrg { code: string; name: string; companyCode: string | null; scope: 'Central' | 'Local' | 'Cross-company' }
export interface Buyer { code: string; name: string; email: string; purchaseOrg: string; categories: string[]; poLimit: number; currency: string }
export interface Warehouse {
  code: string;
  name: string;
  type: 'Distribution Centre' | 'Store Back-Store' | 'Dark Store' | 'Returns Centre';
  differentiator: 'EWM (bin-managed)' | 'IM (location only)' | 'Lean WM';
  plant: string;
  storageLocations: { code: string; name: string }[];
}
export interface StorePlant {
  code: string;
  name: string;
  city: string;
  format: 'Flagship' | 'High Street' | 'Express' | 'Hypermarket' | 'DC';
  companyCode: string;
  salesOrg: string;
  purchaseOrg: string;
  channels: string[];
  supplyingSite: string;
  manager: string;
}

export const COMPANY_CODES: CompanyCode[] = [
  { code: '1000', name: 'RetailCo Netherlands B.V.', country: 'NL', currency: 'EUR', fiscalVariant: 'K4 (Calendar)' },
  { code: '2000', name: 'RetailCo India Pvt. Ltd.', country: 'IN', currency: 'INR', fiscalVariant: 'V3 (Apr–Mar)' },
];

export const DISTRIBUTION_CHANNELS: DistributionChannel[] = [
  { code: '10', name: 'Store / Retail', description: 'Walk-in sales via store POS' },
  { code: '20', name: 'E-commerce', description: 'Web & app orders shipped from DC or store' },
  { code: '30', name: 'Wholesale / B2B', description: 'Bulk & business customers' },
  { code: '40', name: 'Click & Collect', description: 'Online order, picked & collected in store' },
];

export const SALES_ORGS: SalesOrg[] = [
  { code: 'NL01', name: 'Retail Sales Netherlands', companyCode: '1000', channels: ['10', '40'] },
  { code: 'NL02', name: 'Online Sales Netherlands', companyCode: '1000', channels: ['20', '40'] },
  { code: 'IN01', name: 'Retail Sales India', companyCode: '2000', channels: ['10', '20', '30'] },
];

export const PURCHASE_ORGS: PurchaseOrg[] = [
  { code: 'P100', name: 'Central Purchasing NL', companyCode: '1000', scope: 'Central' },
  { code: 'P110', name: 'Local Fresh Purchasing NL', companyCode: '1000', scope: 'Local' },
  { code: 'P200', name: 'Central Purchasing India', companyCode: '2000', scope: 'Central' },
  { code: 'P900', name: 'Group Electronics Sourcing', companyCode: null, scope: 'Cross-company' },
];

export const BUYERS: Buyer[] = [
  { code: 'B01', name: 'Marco Bianchi', email: 'm.bianchi@retailco.com', purchaseOrg: 'P110', categories: ['1010', '1020', '1030'], poLimit: 50000, currency: 'EUR' },
  { code: 'B02', name: 'Anouk de Vries', email: 'a.devries@retailco.com', purchaseOrg: 'P100', categories: ['2010', '2020'], poLimit: 75000, currency: 'EUR' },
  { code: 'B03', name: 'Thomas Weber', email: 't.weber@retailco.com', purchaseOrg: 'P900', categories: ['3010', '3020'], poLimit: 150000, currency: 'EUR' },
  { code: 'B04', name: 'Fatima El Amrani', email: 'f.elamrani@retailco.com', purchaseOrg: 'P100', categories: ['4010'], poLimit: 40000, currency: 'EUR' },
  { code: 'B05', name: 'Arjun Mehta', email: 'a.mehta@retailco.in', purchaseOrg: 'P200', categories: ['1010', '2010', '2020', '4010'], poLimit: 2500000, currency: 'INR' },
];

export const WAREHOUSES: Warehouse[] = [
  { code: 'W100', name: 'DC Tilburg', type: 'Distribution Centre', differentiator: 'EWM (bin-managed)', plant: '9100', storageLocations: [{ code: '1000', name: 'Ambient' }, { code: '1100', name: 'Chilled' }, { code: '1200', name: 'Frozen' }, { code: '1900', name: 'Returns' }] },
  { code: 'W200', name: 'DC Chennai (Sriperumbudur)', type: 'Distribution Centre', differentiator: 'EWM (bin-managed)', plant: '9200', storageLocations: [{ code: '1000', name: 'Ambient' }, { code: '1100', name: 'Chilled' }] },
  { code: 'S1001', name: 'Amsterdam Central back-store', type: 'Store Back-Store', differentiator: 'Lean WM', plant: '1001', storageLocations: [{ code: '0001', name: 'Sales floor' }, { code: '0002', name: 'Back-store' }, { code: '0003', name: 'Quarantine / damaged' }] },
  { code: 'S1002', name: 'Rotterdam Centraal back-store', type: 'Store Back-Store', differentiator: 'IM (location only)', plant: '1002', storageLocations: [{ code: '0001', name: 'Sales floor' }, { code: '0002', name: 'Back-store' }] },
  { code: 'D1005', name: 'Amsterdam Noord dark store', type: 'Dark Store', differentiator: 'Lean WM', plant: '1005', storageLocations: [{ code: '0002', name: 'Pick area' }] },
];

export const STORES: StorePlant[] = [
  { code: '1001', name: 'Amsterdam Central', city: 'Amsterdam', format: 'Flagship', companyCode: '1000', salesOrg: 'NL01', purchaseOrg: 'P100', channels: ['10', '40'], supplyingSite: '9100', manager: 'Sarah Jenkins' },
  { code: '1002', name: 'Rotterdam Centraal', city: 'Rotterdam', format: 'High Street', companyCode: '1000', salesOrg: 'NL01', purchaseOrg: 'P100', channels: ['10'], supplyingSite: '9100', manager: 'Daan Bakker' },
  { code: '1004', name: 'Utrecht Station', city: 'Utrecht', format: 'Express', companyCode: '1000', salesOrg: 'NL01', purchaseOrg: 'P100', channels: ['10', '40'], supplyingSite: '9100', manager: 'Sophie Jansen' },
  { code: '1005', name: 'Amsterdam Noord (Dark)', city: 'Amsterdam', format: 'Express', companyCode: '1000', salesOrg: 'NL02', purchaseOrg: 'P100', channels: ['20'], supplyingSite: '9100', manager: 'Sarah Jenkins' },
  { code: '2001', name: 'Chennai T. Nagar', city: 'Chennai', format: 'Hypermarket', companyCode: '2000', salesOrg: 'IN01', purchaseOrg: 'P200', channels: ['10', '20', '30'], supplyingSite: '9200', manager: 'Karthik Subramanian' },
  { code: '9100', name: 'DC Tilburg', city: 'Tilburg', format: 'DC', companyCode: '1000', salesOrg: 'NL01', purchaseOrg: 'P100', channels: ['30'], supplyingSite: '—', manager: 'Joris Visser' },
  { code: '9200', name: 'DC Chennai', city: 'Sriperumbudur', format: 'DC', companyCode: '2000', salesOrg: 'IN01', purchaseOrg: 'P200', channels: ['30'], supplyingSite: '—', manager: 'Lakshmi Narayanan' },
];

// ───────────────────────── CATEGORY / MC HIERARCHY ─────────────────────────
export interface CategoryNode {
  code: string;
  name: string;
  level: 'Department' | 'Category' | 'Merchandise Category';
  parent: string | null;
  buyer?: string;
  skuCount?: number;
  stockValue?: number; // EUR
  sales30d?: number; // EUR
  margin?: number; // %
  tempZone?: 'Ambient' | 'Chilled' | 'Frozen' | 'Secure';
  perishable?: boolean;
}

export const CATEGORY_SEED: CategoryNode[] = [
  { code: '10', name: 'Fresh Food', level: 'Department', parent: null },
  { code: '1010', name: 'Dairy', level: 'Category', parent: '10', buyer: 'B01' },
  { code: '101010', name: 'Milk', level: 'Merchandise Category', parent: '1010', buyer: 'B01', skuCount: 42, stockValue: 18400, sales30d: 96500, margin: 18.5, tempZone: 'Chilled', perishable: true },
  { code: '101020', name: 'Yoghurt & Desserts', level: 'Merchandise Category', parent: '1010', buyer: 'B01', skuCount: 88, stockValue: 22150, sales30d: 71200, margin: 27.1, tempZone: 'Chilled', perishable: true },
  { code: '101030', name: 'Cheese', level: 'Merchandise Category', parent: '1010', buyer: 'B01', skuCount: 120, stockValue: 41800, sales30d: 88400, margin: 31.4, tempZone: 'Chilled', perishable: true },
  { code: '1020', name: 'Produce', level: 'Category', parent: '10', buyer: 'B01' },
  { code: '102010', name: 'Fruit', level: 'Merchandise Category', parent: '1020', buyer: 'B01', skuCount: 64, stockValue: 9800, sales30d: 104300, margin: 34.2, tempZone: 'Ambient', perishable: true },
  { code: '102020', name: 'Vegetables', level: 'Merchandise Category', parent: '1020', buyer: 'B01', skuCount: 71, stockValue: 8600, sales30d: 92800, margin: 32.0, tempZone: 'Chilled', perishable: true },
  { code: '1030', name: 'Bakery', level: 'Category', parent: '10', buyer: 'B01' },
  { code: '103010', name: 'Bread & Rolls', level: 'Merchandise Category', parent: '1030', buyer: 'B01', skuCount: 37, stockValue: 3100, sales30d: 45200, margin: 41.5, tempZone: 'Ambient', perishable: true },
  { code: '20', name: 'Grocery Ambient', level: 'Department', parent: null },
  { code: '2010', name: 'Beverages', level: 'Category', parent: '20', buyer: 'B02' },
  { code: '201010', name: 'Soft Drinks & Water', level: 'Merchandise Category', parent: '2010', buyer: 'B02', skuCount: 156, stockValue: 52300, sales30d: 118900, margin: 22.3, tempZone: 'Ambient' },
  { code: '201020', name: 'Coffee & Tea', level: 'Merchandise Category', parent: '2010', buyer: 'B02', skuCount: 98, stockValue: 38700, sales30d: 61200, margin: 29.8, tempZone: 'Ambient' },
  { code: '2020', name: 'Snacks', level: 'Category', parent: '20', buyer: 'B02' },
  { code: '202010', name: 'Chips & Savoury', level: 'Merchandise Category', parent: '2020', buyer: 'B02', skuCount: 132, stockValue: 27600, sales30d: 73400, margin: 33.6, tempZone: 'Ambient' },
  { code: '202020', name: 'Confectionery', level: 'Merchandise Category', parent: '2020', buyer: 'B02', skuCount: 210, stockValue: 44900, sales30d: 82100, margin: 36.2, tempZone: 'Ambient' },
  { code: '30', name: 'Electronics', level: 'Department', parent: null },
  { code: '3010', name: 'Audio', level: 'Category', parent: '30', buyer: 'B03' },
  { code: '301010', name: 'Headphones & Earbuds', level: 'Merchandise Category', parent: '3010', buyer: 'B03', skuCount: 46, stockValue: 128400, sales30d: 96700, margin: 24.8, tempZone: 'Secure' },
  { code: '3020', name: 'Mobile Accessories', level: 'Category', parent: '30', buyer: 'B03' },
  { code: '302010', name: 'Chargers & Cables', level: 'Merchandise Category', parent: '3020', buyer: 'B03', skuCount: 84, stockValue: 31200, sales30d: 39800, margin: 48.3, tempZone: 'Secure' },
  { code: '40', name: 'Household', level: 'Department', parent: null },
  { code: '4010', name: 'Cleaning', level: 'Category', parent: '40', buyer: 'B04' },
  { code: '401010', name: 'Detergents', level: 'Merchandise Category', parent: '4010', buyer: 'B04', skuCount: 73, stockValue: 19800, sales30d: 34600, margin: 26.9, tempZone: 'Ambient' },
  { code: '401020', name: 'Paper & Tissue', level: 'Merchandise Category', parent: '4010', buyer: 'B04', skuCount: 41, stockValue: 15600, sales30d: 29900, margin: 21.4, tempZone: 'Ambient' },
];

export const categoryStore = createPersistentStore<CategoryNode[]>('ss.categories.v1', () => CATEGORY_SEED);

// ───────────────────────── BACK-STORE BINS & STOCK MAPPING ─────────────────────────
export interface Bin {
  code: string; // e.g. BS-A-01-02 (back-store · zone · rack · level)
  store: string;
  zone: 'Ambient Racking' | 'Chiller' | 'Freezer' | 'Secure Cage' | 'Receiving Dock' | 'Returns / Damaged';
  capacity: number; // units
  blocked?: boolean;
}

export interface StockMapping {
  sku: string;
  description: string;
  mc: string;
  store: string;
  shelfLocation: string; // planogram location on the sales floor
  shelfQty: number;
  shelfCapacity: number;
  minShelf: number; // replenish shelf when below
  bin: string;
  backQty: number;
  uom: string;
}

const BIN_SEED: Bin[] = [
  ...['01', '02', '03', '04'].flatMap((rack) => ['01', '02', '03'].map((lvl) => ({ code: `BS-A-${rack}-${lvl}`, store: '1001', zone: 'Ambient Racking' as const, capacity: 240 }))),
  { code: 'BS-C-01-01', store: '1001', zone: 'Chiller', capacity: 120 },
  { code: 'BS-C-01-02', store: '1001', zone: 'Chiller', capacity: 120 },
  { code: 'BS-C-02-01', store: '1001', zone: 'Chiller', capacity: 120 },
  { code: 'BS-F-01-01', store: '1001', zone: 'Freezer', capacity: 80 },
  { code: 'BS-S-01-01', store: '1001', zone: 'Secure Cage', capacity: 60 },
  { code: 'BS-S-01-02', store: '1001', zone: 'Secure Cage', capacity: 60 },
  { code: 'RCV-01', store: '1001', zone: 'Receiving Dock', capacity: 600 },
  { code: 'RTV-01', store: '1001', zone: 'Returns / Damaged', capacity: 100 },
  ...['01', '02'].flatMap((rack) => ['01', '02'].map((lvl) => ({ code: `BS-A-${rack}-${lvl}`, store: '1002', zone: 'Ambient Racking' as const, capacity: 200 }))),
  { code: 'BS-C-01-01', store: '1002', zone: 'Chiller', capacity: 100 },
  { code: 'RCV-01', store: '1002', zone: 'Receiving Dock', capacity: 400 },
];

const MAP_SEED: StockMapping[] = [
  { sku: 'MAT-20349', description: 'AirPods Pro (USB-C)', mc: '301010', store: '1001', shelfLocation: 'SF-12-A (Electronics wall)', shelfQty: 3, shelfCapacity: 12, minShelf: 4, bin: 'BS-S-01-01', backQty: 22, uom: 'EA' },
  { sku: 'MAT-20411', description: 'USB-C Fast Charger 30W', mc: '302010', store: '1001', shelfLocation: 'SF-12-C', shelfQty: 18, shelfCapacity: 24, minShelf: 8, bin: 'BS-S-01-02', backQty: 40, uom: 'EA' },
  { sku: 'MAT-10021', description: 'Organic Whole Milk 2L', mc: '101010', store: '1001', shelfLocation: 'SF-03-B (Chiller aisle 3)', shelfQty: 14, shelfCapacity: 48, minShelf: 20, bin: 'BS-C-01-01', backQty: 60, uom: 'EA' },
  { sku: 'MAT-10077', description: 'Greek Yoghurt 500g', mc: '101020', store: '1001', shelfLocation: 'SF-03-D', shelfQty: 30, shelfCapacity: 36, minShelf: 12, bin: 'BS-C-02-01', backQty: 45, uom: 'EA' },
  { sku: 'MAT-10102', description: 'Aged Gouda 400g', mc: '101030', store: '1001', shelfLocation: 'SF-04-A', shelfQty: 6, shelfCapacity: 30, minShelf: 10, bin: 'BS-C-01-02', backQty: 28, uom: 'EA' },
  { sku: 'MAT-30112', description: 'Sparkling Water 6×1.5L', mc: '201010', store: '1001', shelfLocation: 'SF-08-A', shelfQty: 22, shelfCapacity: 40, minShelf: 15, bin: 'BS-A-01-01', backQty: 120, uom: 'PK' },
  { sku: 'MAT-30140', description: 'Arabica Coffee Beans 1kg', mc: '201020', store: '1001', shelfLocation: 'SF-09-C', shelfQty: 4, shelfCapacity: 20, minShelf: 6, bin: 'BS-A-02-01', backQty: 0, uom: 'EA' },
  { sku: 'MAT-30201', description: 'Sea Salt Chips 200g', mc: '202010', store: '1001', shelfLocation: 'SF-10-B', shelfQty: 40, shelfCapacity: 60, minShelf: 20, bin: 'BS-A-02-02', backQty: 96, uom: 'EA' },
  { sku: 'MAT-30255', description: 'Dark Chocolate 70% 100g', mc: '202020', store: '1001', shelfLocation: 'SF-11-A', shelfQty: 9, shelfCapacity: 50, minShelf: 15, bin: 'BS-A-03-01', backQty: 70, uom: 'EA' },
  { sku: 'MAT-40310', description: 'Laundry Detergent 2.5L', mc: '401010', store: '1001', shelfLocation: 'SF-15-A', shelfQty: 11, shelfCapacity: 24, minShelf: 8, bin: 'BS-A-04-01', backQty: 36, uom: 'EA' },
  { sku: 'MAT-40322', description: 'Toilet Tissue 9-roll', mc: '401020', store: '1001', shelfLocation: 'SF-15-C', shelfQty: 5, shelfCapacity: 30, minShelf: 10, bin: 'BS-A-04-02', backQty: 54, uom: 'PK' },
  { sku: 'MAT-50410', description: 'Frozen Peas 1kg', mc: '102020', store: '1001', shelfLocation: 'SF-05-F (Freezer)', shelfQty: 16, shelfCapacity: 24, minShelf: 8, bin: 'BS-F-01-01', backQty: 32, uom: 'EA' },
  { sku: 'MAT-10021', description: 'Organic Whole Milk 2L', mc: '101010', store: '1002', shelfLocation: 'SF-02-A', shelfQty: 8, shelfCapacity: 36, minShelf: 15, bin: 'BS-C-01-01', backQty: 24, uom: 'EA' },
  { sku: 'MAT-30112', description: 'Sparkling Water 6×1.5L', mc: '201010', store: '1002', shelfLocation: 'SF-06-A', shelfQty: 25, shelfCapacity: 30, minShelf: 10, bin: 'BS-A-01-01', backQty: 48, uom: 'PK' },
  { sku: 'MAT-30201', description: 'Sea Salt Chips 200g', mc: '202010', store: '1002', shelfLocation: 'SF-07-B', shelfQty: 7, shelfCapacity: 40, minShelf: 12, bin: 'BS-A-02-01', backQty: 30, uom: 'EA' },
];

export const binStore = createPersistentStore<Bin[]>('ss.bins.v1', () => BIN_SEED);
export const stockMapStore = createPersistentStore<StockMapping[]>('ss.stockmap.v1', () => MAP_SEED);

// ───────────────────────── EMPLOYEES ─────────────────────────
export interface Employee { id: string; name: string; role: string; store: string; shift: 'Early' | 'Day' | 'Late' }

export const EMPLOYEES: Employee[] = [
  { id: 'E-101', name: 'Sarah Jenkins', role: 'store_manager', store: '1001', shift: 'Day' },
  { id: 'E-102', name: 'Lars Van Dijk', role: 'floor_worker', store: '1001', shift: 'Early' },
  { id: 'E-103', name: 'Priya Raman', role: 'warehouse_staff', store: '1001', shift: 'Early' },
  { id: 'E-104', name: 'Noah de Jong', role: 'floor_worker', store: '1001', shift: 'Late' },
  { id: 'E-105', name: 'Emma Smit', role: 'floor_worker', store: '1001', shift: 'Day' },
  { id: 'E-106', name: 'Yusuf Kaya', role: 'warehouse_staff', store: '1001', shift: 'Late' },
  { id: 'E-201', name: 'Daan Bakker', role: 'store_manager', store: '1002', shift: 'Day' },
  { id: 'E-202', name: 'Mila Visser', role: 'floor_worker', store: '1002', shift: 'Early' },
];

export function mcName(code: string, nodes: CategoryNode[] = CATEGORY_SEED): string {
  return nodes.find((n) => n.code === code)?.name ?? code;
}
