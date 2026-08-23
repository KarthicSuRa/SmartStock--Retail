'use client';

// /src/app/(desktop)/admin/users/page.tsx
// SmartStock Experience — User Access & Role Administration

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Users, Shield, UserPlus, CheckCircle2 } from 'lucide-react';

export default function UserManagementPage() {
  const users = [
    { name: 'Sarah Jenkins', email: 's.jenkins@retailco.com', role: 'Store Manager', store: '1001 (Amsterdam Central)', status: 'Active', prLimit: '€25,000' },
    { name: 'Karthic B', email: 'bkarthic98@gmail.com', role: 'Integration Admin / Owner', store: 'All Stores', status: 'Active', prLimit: 'Unlimited' },
    { name: 'Lars Van Dijk', email: 'l.vandijk@retailco.com', role: 'Floor Associate', store: '1001 (Amsterdam Central)', status: 'Active', prLimit: 'N/A' },
    { name: 'Elena Rostova', email: 'e.rostova@retailco.com', role: 'Regional Supply Chain', store: 'Benelux Region', status: 'Active', prLimit: '€100,000' },
  ];

  return (
    <div className="space-y-6">
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div>
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">RBAC Enabled</Badge>
            <span className="text-xs font-mono text-[#667085]">Separation of Duties (SoD) Active</span>
          </div>
          <h1 className="text-xl font-bold text-[#101828] tracking-tight mt-1">User Directory & Permissions</h1>
          <p className="text-xs text-[#475467]">Manage role-based access control, store delegations, and emergency PO thresholds.</p>
        </div>
      </div>

      <div className="op-card bg-white overflow-hidden">
        <div className="p-4 border-b border-[#EAECF0] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">Authorized Team Members (4)</h2>
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#EAECF0] bg-[#F9FAFB] text-[#667085]">
              <th className="py-3 px-4 font-semibold">User</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Assigned Store</th>
              <th className="py-3 px-4 font-semibold">PR Approval Limit</th>
              <th className="py-3 px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAECF0]">
            {users.map((u, i) => (
              <tr key={i} className="hover:bg-[#F9FAFB]">
                <td className="py-3.5 px-4 font-medium text-[#101828]">
                  <div>{u.name}</div>
                  <div className="text-[11px] text-[#667085]">{u.email}</div>
                </td>
                <td className="py-3.5 px-4 text-[#475467] font-semibold">{u.role}</td>
                <td className="py-3.5 px-4 text-[#475467] font-mono">{u.store}</td>
                <td className="py-3.5 px-4 text-[#101828] font-mono">{u.prLimit}</td>
                <td className="py-3.5 px-4">
                  <Badge status="healthy" size="sm">{u.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
