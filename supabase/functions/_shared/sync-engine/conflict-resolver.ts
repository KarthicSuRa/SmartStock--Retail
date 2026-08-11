// /supabase/functions/_shared/sync-engine/conflict-resolver.ts

export type MergeStrategy = 'erp_wins' | 'local_wins' | 'merge' | 'manual_review';

export class ConflictResolver {
  constructor(private defaultStrategy: MergeStrategy = 'erp_wins') {}

  async resolve(
    local: any, 
    erp: any, 
    diff: Record<string, { old: any; new: any }>,
    triggeredBy: string
  ): Promise<{ merged: any; hadConflict: boolean; strategy: MergeStrategy; reason?: string }> {
    const hadConflict = this.isConflict(local, erp, diff);
    
    if (!hadConflict) {
      // No real conflict - apply ERP changes
      return { 
        merged: this.applyDiff(local, diff), 
        hadConflict: false, 
        strategy: 'erp_wins' 
      };
    }

    // Determine strategy
    let strategy = this.defaultStrategy;
    
    // Critical conflicts always go to manual review
    if (this.isCriticalConflict(local, erp, diff)) {
      strategy = 'manual_review';
    }
    
    // If triggered by manual sync, respect admin choice
    if (triggeredBy === 'manual' && local.manual_override) {
      strategy = 'local_wins';
    }

    switch (strategy) {
      case 'erp_wins':
        return { 
          merged: this.applyDiff(local, diff), 
          hadConflict: true, 
          strategy, 
          reason: 'ERP is source of truth' 
        };
      
      case 'local_wins':
        return { 
          merged: local, 
          hadConflict: true, 
          strategy, 
          reason: 'Local manual override preserved' 
        };
      
      case 'merge':
        const merged = this.smartMerge(local, erp, diff);
        return { 
          merged, 
          hadConflict: true, 
          strategy, 
          reason: 'Field-level merge applied' 
        };
      
      case 'manual_review':
        await this.queueForReview(local, erp, diff);
        return { 
          merged: local, // Retain local state until manual review
          hadConflict: true, 
          strategy, 
          reason: 'Queued for manual review' 
        };
    }
  }

  private isConflict(local: any, erp: any, diff: any): boolean {
    const localModifiedAt = new Date(local.updated_at || 0);
    const lastSyncAt = new Date(local.last_synced_at || 0);
    return localModifiedAt > lastSyncAt;
  }

  private isCriticalConflict(local: any, erp: any, diff: any): boolean {
    // Price changes > 20%
    if (diff.standard_price || diff.contract_net_price) {
      const oldPrice = diff.standard_price?.old || diff.contract_net_price?.old || 0;
      const newPrice = diff.standard_price?.new || diff.contract_net_price?.new || 0;
      if (oldPrice > 0 && Math.abs(newPrice - oldPrice) / oldPrice > 0.20) {
        return true;
      }
    }
    
    // Deletion flag set in ERP
    if (diff.erp_deletion_flag?.new === true) return true;
    
    // Primary vendor switch
    if (diff.is_primary_vendor) return true;
    
    return false;
  }

  private applyDiff(local: any, diff: Record<string, { old: any; new: any }>): any {
    const merged = { ...local };
    for (const [field, values] of Object.entries(diff)) {
      merged[field] = values.new;
    }
    merged.last_synced_at = new Date().toISOString();
    return merged;
  }

  private smartMerge(local: any, erp: any, diff: any): any {
    const merged = { ...local };
    
    for (const [field, values] of Object.entries(diff)) {
      if (field === 'description' || field === 'vendor_name') {
        merged[field] = values.new;
      } else if (field.includes('price')) {
        merged[field] = Math.max(values.old, values.new);
      } else if (field === 'safety_stock' || field === 'reorder_point') {
        merged[field] = values.old; // Local store manager priority
      } else {
        merged[field] = values.new;
      }
    }
    
    merged.last_synced_at = new Date().toISOString();
    return merged;
  }

  private async queueForReview(local: any, erp: any, diff: any) {
    console.warn('[ConflictResolver] Queued critical conflict for review:', { local: local.id, erp: erp.sku, diff });
  }
}
