import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 15;

    const items = [
      {
        material_id: 'MAT-1001',
        sku: 'SKU-DRINK-001',
        description: 'Coca Cola Zero 330ml Can (24 Pack)',
        current_stock: 12,
        priority_score: 98,
        reason: 'High velocity item below safety threshold',
        abc_class: 'A',
        days_since_last_count: 32
      },
      {
        material_id: 'MAT-1002',
        sku: 'SKU-SNACK-004',
        description: 'Doritos Tangy Cheese 150g (12 Pack)',
        current_stock: 8,
        priority_score: 92,
        reason: 'Sales variance registered in POS telemetry',
        abc_class: 'A',
        days_since_last_count: 45
      },
      {
        material_id: 'MAT-1003',
        sku: 'SKU-DAIRY-009',
        description: 'Organic Fresh Whole Milk 2L',
        current_stock: 35,
        priority_score: 85,
        reason: 'FEFO expiry rebalance audit due',
        abc_class: 'B',
        days_since_last_count: 14
      },
      {
        material_id: 'MAT-1004',
        sku: 'SKU-BAKERY-012',
        description: 'Artisan Sourdough Loaf 500g',
        current_stock: 18,
        priority_score: 78,
        reason: 'Daily perishable cycle check',
        abc_class: 'A',
        days_since_last_count: 3
      },
      {
        material_id: 'MAT-1005',
        sku: 'SKU-MEAT-004',
        description: 'Prime Ribeye Steak 400g',
        current_stock: 15,
        priority_score: 74,
        reason: 'High unit value audit',
        abc_class: 'A',
        days_since_last_count: 19
      }
    ].slice(0, limit);

    return NextResponse.json({ items, success: true });
  } catch (error) {
    return NextResponse.json({ items: [], success: false, error: 'Internal Error' }, { status: 500 });
  }
}
