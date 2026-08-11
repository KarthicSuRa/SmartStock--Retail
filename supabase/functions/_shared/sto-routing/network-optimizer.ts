// /supabase/functions/_shared/sto-routing/network-optimizer.ts

export interface TransferOption {
  sourceStoreId: string;
  sourceStoreName: string;
  availableQty: number;
  transferCost: number;
  transferTimeHours: number;
  distanceKm: number;
  carbonCost: number;
  priorityScore: number;
}

export class NetworkOptimizer {
  constructor(private supabase: any) {}

  async findOptimalTransfer(
    tenantId: string,
    requestingStoreId: string,
    materialId: string,
    neededQty: number
  ): Promise<{ transfers: TransferOption[]; externalQty: number; reasoning: string }> {
    
    const { data: stores } = await this.supabase
      .from('live_inventory_ledger')
      .select('store_id, store_name, current_calculated_stock, reorder_point, safety_stock, unit_cost')
      .eq('tenant_id', tenantId)
      .eq('material_id', materialId)
      .neq('store_id', requestingStoreId);

    if (!stores || stores.length === 0) {
      return { transfers: [], externalQty: neededQty, reasoning: 'No other stores stock this SKU' };
    }

    const { data: storeCoords } = await this.supabase
      .from('stores')
      .select('id, lat, lng, name')
      .eq('tenant_id', tenantId)
      .in('id', stores.map((s: any) => s.store_id));

    const coordMap = new Map(storeCoords?.map((s: any) => [s.id, s]) || []);

    const { data: reqStore } = await this.supabase
      .from('stores')
      .select('lat, lng')
      .eq('id', requestingStoreId)
      .maybeSingle();

    const options: TransferOption[] = [];
    const reqLat = reqStore?.lat || 52.3676;
    const reqLng = reqStore?.lng || 4.9041;

    for (const store of stores) {
      const coords = coordMap.get(store.store_id);
      const lat = coords?.lat || 51.9244;
      const lng = coords?.lng || 4.4777;

      const excess = store.current_calculated_stock - ((store.reorder_point || 0) + (store.safety_stock || 0));
      if (excess <= 0) continue;

      const distance = this.haversineDistance(reqLat, reqLng, lat, lng);
      const fixedCost = 25;
      const perKmCost = 0.35;
      const transferCost = fixedCost + (distance * perKmCost);
      const carbonCost = distance * 0.12;
      const transferTime = (distance / 40) + 2;

      const excessScore = Math.min(excess / neededQty, 2);
      const distanceScore = 1 / (1 + distance / 50);
      const costScore = 1 / (1 + transferCost / 100);

      const priorityScore = (excessScore * 0.4) + (distanceScore * 0.35) + (costScore * 0.25);

      options.push({
        sourceStoreId: store.store_id,
        sourceStoreName: coords?.name || store.store_name || `Store ${store.store_id}`,
        availableQty: Math.min(excess, neededQty),
        transferCost: parseFloat(transferCost.toFixed(2)),
        transferTimeHours: parseFloat(transferTime.toFixed(1)),
        distanceKm: parseFloat(distance.toFixed(1)),
        carbonCost: parseFloat(carbonCost.toFixed(2)),
        priorityScore: parseFloat(priorityScore.toFixed(3))
      });
    }

    options.sort((a, b) => b.priorityScore - a.priorityScore);

    let remainingNeed = neededQty;
    const selectedTransfers: TransferOption[] = [];

    for (const opt of options) {
      if (remainingNeed <= 0) break;
      
      const takeQty = Math.min(opt.availableQty, remainingNeed);
      selectedTransfers.push({
        ...opt,
        availableQty: takeQty
      });
      remainingNeed -= takeQty;
    }

    return {
      transfers: selectedTransfers,
      externalQty: Math.max(0, remainingNeed),
      reasoning: selectedTransfers.length > 0
        ? `Allocated from ${selectedTransfers.length} store(s). Remaining ${remainingNeed} units require external PR.`
        : 'No store has sufficient excess above safety buffer.'
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
