// Dependency-free tests for the EDMX parser and discovery engine.
// Run with: npx -y deno test --no-lock --node-modules-dir=auto <this file>

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DiscoveryHttpClient, DiscoveryHttpResponse, runDiscovery,
} from "./discovery.ts";
import { hasProperty, parseEdmx } from "./metadata-parser.ts";
import { ERPConfig } from "./types.ts";

const V2_METADATA = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
 <edmx:DataServices>
  <Schema Namespace="TEST" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
   <EntityType Name="BaseEntity">
    <Key><PropertyRef Name="Product"/></Key>
    <Property Name="BaseUnit" Type="Edm.String" MaxLength="3"/>
   </EntityType>
   <EntityType Name="A_Product" BaseType="TEST.BaseEntity">
    <Property Name="Product" Type="Edm.String"/>
    <Property Name="IsMarkedForDeletion" Type="Edm.String"/>
    <Property Name="EAN" Type="Edm.String"/>
    <NavigationProperty Name="to_Description" Relationship="TEST.X"/>
    <NavigationProperty Name="to_Plant" Relationship="TEST.Y"/>
   </EntityType>
   <EntityType Name="A_MaterialStock">
    <Property Name="Material" Type="Edm.String"/>
    <Property Name="Plant" Type="Edm.String"/>
    <Property Name="StorageLocation" Type="Edm.String"/>
    <Property Name="InventoryStockType" Type="Edm.String"/>
    <NavigationProperty Name="to_MatlStkInAcctMod" Relationship="TEST.X"/>
   </EntityType>
   <EntityType Name="A_MaterialDocumentHeader">
    <Property Name="PostingDate" Type="Edm.DateTime"/>
    <Property Name="DocumentDate" Type="Edm.DateTime"/>
    <Property Name="GoodsMovementCode" Type="Edm.String"/>
    <Property Name="MaterialDocumentHeaderText" Type="Edm.String"/>
    <NavigationProperty Name="to_MaterialDocumentItem" Relationship="TEST.X"/>
   </EntityType>
   <EntityType Name="A_PurchaseRequisitionHeader">
    <Property Name="PurchaseRequisitionType" Type="Edm.String"/>
    <Property Name="PurReqnDescription" Type="Edm.String"/>
    <Property Name="PurReqnDoOnlyValidation" Type="Edm.Boolean"/>
    <NavigationProperty Name="to_PurchaseReqnItem" Relationship="TEST.X"/>
   </EntityType>
   <EntityType Name="A_PurchaseOrder">
    <Property Name="CompanyCode" Type="Edm.String"/>
    <Property Name="PurchaseOrderType" Type="Edm.String"/>
    <Property Name="Supplier" Type="Edm.String"/>
    <Property Name="DocumentCurrency" Type="Edm.String"/>
    <Property Name="PurchasingOrganization" Type="Edm.String"/>
    <Property Name="PurchasingGroup" Type="Edm.String"/>
    <Property Name="TotalNetAmount" Type="Edm.Decimal"/>
    <NavigationProperty Name="to_PurchaseOrderItem" Relationship="TEST.X"/>
   </EntityType>
   <EntityType Name="A_Supplier">
    <Property Name="Supplier" Type="Edm.String"/>
    <Property Name="SupplierName" Type="Edm.String"/>
    <Property Name="Currency" Type="Edm.String"/>
    <Property Name="MinimumOrderQuantity" Type="Edm.Decimal"/>
    <Property Name="RoundingValue" Type="Edm.Decimal"/>
   </EntityType>
   <EntityContainer Name="TEST_Entities">
    <EntitySet Name="A_Product" EntityType="TEST.A_Product"/>
    <EntitySet Name="A_MaterialStock" EntityType="TEST.A_MaterialStock"/>
    <EntitySet Name="A_MaterialDocumentHeader" EntityType="TEST.A_MaterialDocumentHeader"/>
    <EntitySet Name="A_PurchaseRequisitionHeader" EntityType="TEST.A_PurchaseRequisitionHeader"/>
    <EntitySet Name="A_PurchaseOrder" EntityType="TEST.A_PurchaseOrder"/>
    <EntitySet Name="A_Supplier" EntityType="TEST.A_Supplier"/>
   </EntityContainer>
  </Schema>
 </edmx:DataServices>
</edmx:Edmx>`;

class FakeClient implements DiscoveryHttpClient {
  async rawGet(
    path: string,
    opts?: { accept?: string; headers?: Record<string, string> },
  ): Promise<DiscoveryHttpResponse> {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "x-csrf-token" && opts?.headers?.["X-CSRF-Token"] === "Fetch"
          ? "FAKE-TOKEN"
          : null,
    };
    if (path.endsWith("/$metadata")) {
      return { status: 200, ok: true, headers, text: async () => V2_METADATA, json: async () => ({}) };
    }
    let rows: any[] = [{}];
    if (path.includes("A_Product")) rows = [{ Product: "10000001", BaseUnit: "PC", EAN: "4000000000000" }];
    if (path.includes("A_MaterialStock")) rows = [{ Plant: "1001", StorageLocation: "0001" }];
    if (path.includes("A_Supplier")) rows = [{ Supplier: "V001", SupplierName: "Vendor", Currency: "EUR" }];
    return {
      status: 200,
      ok: true,
      headers,
      text: async () => JSON.stringify({ d: { results: rows } }),
      json: async () => ({ d: { results: rows } }),
    };
  }
}

const config: ERPConfig = {
  id: "00000000-0000-0000-0000-000000000001",
  tenant_id: "00000000-0000-0000-0000-000000000002",
  erp_type: "sap_s4hana",
  erp_name: "Test SAP",
  base_url: "https://sap.example.invalid",
  auth_method: "oauth2",
  auth_config: { client_id: "test", client_secret: "test", token_url: "https://sap.example.invalid/oauth/token" },
  connection_status: "inactive",
  company_code: "1000",
  purchasing_org: "1000",
  purchasing_group: "001",
  metadata: { plant_map: { "store-1": "1001" }, sap_defaults: { defaultStorageLocation: "0001" } },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

Deno.test("parser detects V2 and resolves inherited properties", () => {
  const parsed = parseEdmx(V2_METADATA);
  assertEquals(parsed.version, "V2");
  assert(hasProperty(parsed, "A_Product", "BaseUnit"), "inherited BaseUnit should be visible");
  assert(hasProperty(parsed, "A_Product", "EAN"));
  assertEquals(parsed.entitySets["A_Supplier"], "TEST.A_Supplier");
});

Deno.test("parser refuses an unparseable contract", () => {
  const parsed = parseEdmx("<html>login required</html>");
  assertEquals(parsed.version, "UNKNOWN");
  assert(parsed.error?.includes("Could not determine"));
});

Deno.test("discovery proposes maps and never claims READY while gates are open", async () => {
  const result = await runDiscovery({ client: new FakeClient(), config, plants: ["1001"] });
  assertEquals(result.sap.odata_version, "V2");
  assertEquals(result.verdict, "CONDITIONAL");
  assertEquals(result.blocking_findings.length, 0);
  assertEquals(result.proposals.sap_field_map.material.ean_gtin, "EAN");
  assert(result.proposals.sap_expands.material.includes("to_Plant"));
  assert(result.human_gates.includes("POSTING_PERIODS"));
  assert(result.checks.some((c) => c.id === "gate.POSTING_PERIODS" && c.status === "UNVERIFIABLE"));
});
