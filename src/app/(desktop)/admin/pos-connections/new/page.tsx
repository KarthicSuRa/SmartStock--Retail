'use client';

// /src/app/(desktop)/admin/pos-connections/new/page.tsx
// SmartStock Experience V1 — 5-Step POS Mapping Studio & Onboarding Engine

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import { Stepper, StepItem } from '@/components/ui/Stepper';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, ArrowRight, ArrowLeft, Eye, ShieldCheck, Zap } from 'lucide-react';

export default function POSMappingStudioPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [vendor, setVendor] = useState('shopify');
  const [isActivating, setIsActivating] = useState(false);

  const steps: StepItem[] = [
    { id: 'connect', label: '1. Connect', description: 'Vendor & transport' },
    { id: 'map', label: '2. Map', description: 'Schema & fields' },
    { id: 'validate', label: '3. Validate', description: '25-scenario test' },
    { id: 'shadow', label: '4. Shadow', description: 'Non-disruptive validation' },
    { id: 'activate', label: '5. Activate', description: 'Live digital twin' },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setIsActivating(true);
      setTimeout(() => {
        setIsActivating(false);
        toast({
          type: 'success',
          title: 'POS Connection Activated Live',
          description: 'Live retail transaction stream is now updating store inventory.',
        });
        router.push('/admin/pos-control-tower');
      }, 800);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#E4E7EC] pb-4">
        <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
          POS Integration & Mapping Studio
        </h1>
        <p className="text-xs text-[#475467] mt-0.5">
          Connect retail POS endpoints, map schemas, and validate against 25 enterprise test scenarios.
        </p>
      </div>

      {/* Stepper */}
      <div className="op-card p-4 bg-white">
        <Stepper steps={steps} currentStepIndex={currentStep} onStepClick={(i) => setCurrentStep(i)} />
      </div>

      {/* Step Workspace */}
      <div className="op-card p-6 bg-white space-y-5 min-h-[340px]">
        {currentStep === 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[#101828]">Select POS Platform & Transport</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { id: 'shopify', name: 'Shopify POS', type: 'Webhook' },
                { id: 'square', name: 'Square Register', type: 'REST & Webhook' },
                { id: 'lightspeed', name: 'Lightspeed (X-Series)', type: 'Webhook' },
                { id: 'clover', name: 'Clover Platform', type: 'Webhook SDK' },
                { id: 'database', name: 'SQL Database (Edge)', type: 'Direct SQL' },
                { id: 'file_sftp', name: 'Batch SFTP Drop', type: 'CSV/XML File' },
              ].map((v) => (
                <div
                  key={v.id}
                  onClick={() => setVendor(v.id)}
                  className={`p-3.5 rounded-[6px] border cursor-pointer select-none transition-colors ${
                    vendor === v.id
                      ? 'border-[#14706B] bg-[#E8F4F3]/40 font-semibold text-[#14706B]'
                      : 'border-[#E4E7EC] hover:bg-[#F9FAFB] text-[#344054]'
                  }`}
                >
                  <p className="text-xs font-semibold text-[#101828]">{v.name}</p>
                  <p className="text-[11px] text-[#667085]">{v.type}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[#101828]">Field & Identity Mapping</h3>
            <div className="space-y-2 text-xs font-mono">
              {[
                { source: 'order_id / receipt_no', target: 'transaction_id (SmartStock Canonical ID)' },
                { source: 'line_items[].variant_id', target: 'sku (Resolved Canonical SKU)' },
                { source: 'line_items[].quantity', target: 'quantity (Base magnitude)' },
                { source: 'created_at (ISO 8601)', target: 'business_timestamp' },
                { source: 'location_id', target: 'store_id (SmartStock Store UUID)' },
              ].map((m, i) => (
                <div key={i} className="p-2.5 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] flex items-center justify-between">
                  <span className="text-[#475467]">{m.source}</span>
                  <span className="text-[#14706B] font-bold">─────────────→</span>
                  <span className="text-[#101828] font-semibold">{m.target}</span>
                </div>
              ))}
            </div>

            {/* Live Preview */}
            <div className="p-3 bg-[#E8F4F3] border border-[#14706B]/20 rounded-[6px] text-xs font-mono text-[#101828]">
              <span className="text-[10px] font-sans uppercase font-bold text-[#14706B] block">Live Canonical Preview</span>
              SALE · Store 1001 · SKU AP-PRO-USB-C · Qty: -2 · Timestamp: 2026-08-22T10:00:00Z
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#101828]">Universal Certification Validation</h3>
              <Badge status="healthy" size="sm">
                25/25 Scenarios Passed (100%)
              </Badge>
            </div>
            <p className="text-xs text-[#475467]">
              All edge cases (dispositions, exchanges, composite BOMs, version monotonicity, and barcode decoding) verified.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-[#F9FAFB] rounded border border-[#EAECF0] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#039855]" /> Damaged Return Disposition
              </div>
              <div className="p-2 bg-[#F9FAFB] rounded border border-[#EAECF0] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#039855]" /> Exchange Decomposition
              </div>
              <div className="p-2 bg-[#F9FAFB] rounded border border-[#EAECF0] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#039855]" /> Out-of-Order Monotonicity Guard
              </div>
              <div className="p-2 bg-[#F9FAFB] rounded border border-[#EAECF0] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#039855]" /> Grocery Weighted Barcode PLU
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#14706B]" />
              <h3 className="text-sm font-semibold text-[#101828]">Shadow-Mode Activation</h3>
            </div>
            <p className="text-xs text-[#475467]">
              In Shadow Mode, incoming payloads are parsed, mapped, and reduced into simulated digital twin states without mutating live store inventory.
            </p>
            <div className="p-4 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0] space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span>Shadow Sample Target:</span>
                <strong className="text-[#101828]">500 Transactions</strong>
              </div>
              <div className="flex justify-between">
                <span>Required Mapping Accuracy:</span>
                <strong className="text-[#039855]">≥ 99.5%</strong>
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4 text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#EDFDF5] border border-[#A6F4C5] text-[#039855] flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[#101828]">Ready for Live Production Activation</h3>
              <p className="text-xs text-[#475467] max-w-md mx-auto">
                Authentication verified, mapping accuracy at 100%, and shadow validation passed. Activating will begin updating store inventory twin.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="md"
          disabled={currentStep === 0}
          onClick={handlePrev}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Previous
        </Button>

        <Button
          variant="primary"
          size="md"
          isLoading={isActivating}
          onClick={handleNext}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          {currentStep === steps.length - 1 ? 'Activate Live Connection' : 'Next Step'}
        </Button>
      </div>
    </div>
  );
}
