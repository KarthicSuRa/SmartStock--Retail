// /contracts/sap/contract-registry.ts
// SmartStock LiveRetail V2 — Machine-Readable SAP S/4HANA OData V2 Contract Registry (RC1)

export interface SAPContract {
  service: string;
  version: string;
  entitySet: string;
  requiredFields: string[];
  optionalFields: string[];
  documentedErrors: string[];
}

export const SAP_CONTRACTS: Record<string, SAPContract> = {
  material_stock_read: {
    service: 'API_MATERIAL_STOCK_SRV',
    version: 'v0001',
    entitySet: 'A_MatlStkInAcctMod',
    requiredFields: ['Material', 'Plant', 'StorageLocation', 'MatlWrhsStkQtyInMatlBaseUnit'],
    optionalFields: ['InventorySpecialStockType', 'Batch'],
    documentedErrors: ['404_NOT_FOUND', '401_UNAUTHORIZED', 'M7 062'],
  },

  create_purchase_order: {
    service: 'API_PURCHASEORDER_PROCESS_SRV',
    version: 'v0001',
    entitySet: 'A_PurchaseOrder',
    requiredFields: ['CompanyCode', 'PurchaseOrderType', 'Supplier', 'PurchasingOrganization'],
    optionalFields: ['YourReference', 'PaymentTerms'],
    documentedErrors: ['ME 062', 'ME 085', 'ME 124'],
  },

  create_stock_transport_order: {
    service: 'API_PURCHASEORDER_PROCESS_SRV',
    version: 'v0001',
    entitySet: 'A_PurchaseOrder',
    requiredFields: ['CompanyCode', 'PurchaseOrderType', 'SupplyingPlant', 'PurchasingOrganization'],
    optionalFields: ['YourReference'],
    documentedErrors: ['ME 007', 'M7 009'],
  },

  post_goods_movement: {
    service: 'API_MATERIAL_DOCUMENT_SRV',
    version: 'v0001',
    entitySet: 'A_MaterialDocumentHeader',
    requiredFields: ['GoodsMovementCode', 'GoodsMovementType', 'Material', 'Plant', 'QuantityInBaseUnit'],
    optionalFields: ['StorageLocation', 'CostCenter'],
    documentedErrors: ['M7 021', 'M7 053'],
  },
};
