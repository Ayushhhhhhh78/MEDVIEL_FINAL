import React from 'react';
import { CheckCircle2, Clock, XCircle, ArrowRight, ShieldCheck, FileKey, Cpu, Send, DollarSign } from 'lucide-react';

interface StepperProps {
  currentStatus: string;
}

const STEPS = [
  { key: 'DRAFT', label: 'Claim Created', icon: Clock },
  { key: 'SIGNED', label: 'Hospital EdDSA Signed', icon: FileKey },
  { key: 'SIGNATURE_VERIFIED', label: 'Backend Sig Verified', icon: ShieldCheck },
  { key: 'PROOF_GENERATING', label: 'ZK Witness Prepared', icon: Cpu },
  { key: 'PROOF_GENERATED', label: 'Groth16 Proof Generated', icon: Cpu },
  { key: 'PROOF_VERIFIED', label: 'Locally Verified', icon: CheckCircle2 },
  { key: 'SUBMITTED', label: 'Blockchain Submitted', icon: Send },
  { key: 'ON_CHAIN_VERIFIED', label: 'On-Chain Verified', icon: ShieldCheck },
  { key: 'SETTLED', label: 'Nullifier Consumed & Settled', icon: DollarSign },
];

export default function ClaimProgressStepper({ currentStatus }: StepperProps) {
  const getStepIndex = (status: string) => {
    switch (status) {
      case 'DRAFT': return 0;
      case 'SIGNED': return 1;
      case 'SIGNATURE_VERIFIED': return 2;
      case 'PROOF_GENERATING': return 3;
      case 'PROOF_GENERATED': return 4;
      case 'PROOF_VERIFIED': return 5;
      case 'SUBMITTED': return 6;
      case 'ON_CHAIN_VERIFIED': return 7;
      case 'SETTLED': return 8;
      case 'REJECTED':
      case 'FAILED': return -1;
      default: return 0;
    }
  };

  const activeIdx = getStepIndex(currentStatus);
  const isFailed = currentStatus === 'FAILED' || currentStatus === 'REJECTED';

  return (
    <div className="w-full py-4 overflow-x-auto">
      {isFailed && (
        <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>Claim halted in <strong>{currentStatus}</strong> state. Cryptographic or policy validation constraints failed.</span>
        </div>
      )}

      <div className="flex items-center justify-between min-w-[700px]">
        {STEPS.map((step, idx) => {
          const isDone = activeIdx >= idx;
          const isCurrent = activeIdx === idx;
          const Icon = step.icon;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center text-center max-w-[90px]">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                    isDone
                      ? 'bg-[#0e261f] border-[#175c44] text-[#54f2a3] shadow-sm'
                      : 'bg-[#0c161e] border-[#172935] text-slate-500'
                  } ${isCurrent ? 'ring-2 ring-[#54f2a3] ring-offset-2 ring-offset-[#070d12]' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={`mt-2 text-[10px] font-medium leading-tight ${
                    isDone ? 'text-[#54f2a3]' : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-all ${
                    activeIdx > idx ? 'bg-[#54f2a3]' : 'bg-[#172935]'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
