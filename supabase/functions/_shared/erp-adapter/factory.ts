// /supabase/functions/_shared/erp-adapter/factory.ts

import { ERPConfig, IERPAdapter } from './types.ts';
import { SAPAdapter } from './sap-adapter.ts';
import { MockAdapter } from './mock-adapter.ts';

export class AdapterFactory {
  static createAdapter(config: ERPConfig): IERPAdapter {
    switch (config.erp_type) {
      case 'sap_s4hana':
      case 'sap_ecc':
        return new SAPAdapter(config);
      
      case 'mock':
        return new MockAdapter(config);
      
      // Future adapters:
      // case 'netsuite':
      //   return new NetSuiteAdapter(config);
      // case 'dynamics365':
      //   return new DynamicsAdapter(config);
      
      default:
        throw new Error(`Unsupported ERP type: ${config.erp_type}`);
    }
  }

  static async getAdapterForTenant(tenantId: string, supabaseClient: any): Promise<IERPAdapter> {
    // Fetch ERP config from Supabase
    const { data, error } = await supabaseClient
      .from('erp_configurations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('connection_status', 'active')
      .single();

    if (error || !data) {
      // Fall back to MockAdapter if no explicit DB config found or for default single-tenant setups
      console.warn(`No active ERP configuration found for tenant ${tenantId}. Falling back to Mock ERP adapter.`);
      const defaultConfig: ERPConfig = {
        id: 'default-mock',
        tenant_id: tenantId || 'default-tenant',
        erp_type: 'mock',
        base_url: 'https://mock-erp.local',
        auth_method: 'basic',
        auth_config: { username: 'mock', password: 'mock' },
        connection_status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return this.createAdapter(defaultConfig);
    }

    return this.createAdapter(data as ERPConfig);
  }
}
