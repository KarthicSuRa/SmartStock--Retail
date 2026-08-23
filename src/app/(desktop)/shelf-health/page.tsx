'use client';

import React from 'react';
import { ShelfHealthScanner } from '@/components/scanner/ShelfHealthScanner';
import { Eye, Camera, ShieldCheck } from 'lucide-react';

export default function DesktopShelfHealthPage() {
  return (
    <div className="space-y-6">
      
      {/* Banner (White Theme) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
              AI Vision Pipeline
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">Vision Shelf Health & Planogram Compliance</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Computer vision out-of-stock gap detection, shelf fullness scoring & planogram error auditing.
          </p>
        </div>

        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-600">
          <Eye className="w-8 h-8" />
        </div>
      </div>

      {/* Main Scanner Container (White Theme) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
        <ShelfHealthScanner />
      </div>
    </div>
  );
}
