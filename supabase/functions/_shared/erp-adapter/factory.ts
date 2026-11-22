// /supabase/functions/_shared/erp-adapter/factory.ts

import { ERPConfig, IERPAdapter, SAPAuthConfig } from './types.ts';
import { SAPAdapter } from './sap-adapter.ts';
import { MockAdapter } from './mock-adapter.ts';
import { SapConfigurationError } from './errors.ts';

export class AdapterFactory {
  /**
   * Resolves the OAuth secret from an Edge secret when configured. Keeping the
   * secret out of erp_configurations means a database read cannot expose it and
   * rotation does not require a row update.
   */
  private static resolveSapAuth(config: ERPConfig): ERPConfig {
    if (config.erp_type !== 'sap_s4hana' && config.erp_type !== 'sap_ecc') return config;

    const auth = config.auth_config as SAPAuthConfig;
    if (!auth || typeof auth !== 'object') return config;

    if (auth.client_secret_env) {
      const secret = Deno.env.get(auth.client_secret_env);
      if (!secret) {
        throw new SapConfigurationError(
          `Edge secret '${auth.client_secret_env}' referenced by erp_configurations.auth_config.client_secret_env is not set.`,
        );
      }
      return { ...config, auth_config: { ...auth, client_secret: secret } };
    }

    if (!auth.client_secret) {
      throw new SapConfigurationError(
        'SAP OAuth client secret is not configured. Set auth_config.client_secret_env to the name of a Supabase Edge secret; do not store the plaintext secret in erp_configurations.',
      );
    }
    return config;
  }

  static createAdapter(config: ERPConfig): IERPAdapter {
    switch (config.erp_type) {
      case 'sap_s4hana':
      case 'sap_ecc':
        return new SAPAdapter(this.resolveSapAuth(config));
      
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
