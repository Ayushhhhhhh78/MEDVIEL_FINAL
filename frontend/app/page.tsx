'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Lock,
  Cpu,
  ArrowRight,
  EyeOff,
  CheckCircle,
  FileText,
  DollarSign,
  Activity,
  Layers,
  Key,
  Check,
} from 'lucide-react';

type RoleType = 'Patient' | 'Doctor' | 'Hospital' | 'Insurer';

export default function LandingPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleType>('Patient');
  const [encrypting, setEncrypting] = useState(false);
  const [encryptedStatus, setEncryptedStatus] = useState<string | null>(null);

  const sampleJsonPatient = `  "diagnosis": "Acute appendicitis",
  "procedure": "Laparoscopic appendectomy",
  "icd10": "K35.80",
  "prescription": [
    "Cefazolin 1g",
    "Paracetamol 650mg"
  ],
  "note": "Confidential medical record data"
}`;

  const sampleJsonDoctor = `{
  "consultationId": "CONS-2026-9921",
  "patientId": "PAT-RAHUL-01",
  "accessGrantedBy": "Rahul Sharma",
  "accessValidUntil": "2026-12-31T23:59:59Z",
  "authorizedDoctor": "Dr. Sharma (MBBS, MS)",
  "clinicalNotes": "Post-operative follow-up satisfactory. Sutures intact."
}`;

  const sampleJsonHospital = `{
  "claimId": "CLM-2026-0515",
  "hospitalId": 101,
  "hospitalName": "Apollo Synthetic Hospital",
  "procedureCode": 7701,
  "claimAmountINR": 250000,
  "babyJubJubSignature": {
    "R8x": "107354562775086165153534809...",
    "R8y": "116440220202009719118036979...",
    "S":   "158134089384631713180432276..."
  }
}`;

  const sampleJsonInsurer = `{
  "policyId": 5001,
  "policyLimitINR": 500000,
  "coverageMerkleRoot": "528363229378803684585832910...",
  "onChainCommitment": "135224347745861699369775808...",
  "groth16Verification": {
    "pairingCheck": "PASSED",
    "nullifierConsumed": "1457073874946988354195697..."
  }
}`;

  const handleEncryptAndUpload = () => {
    setEncrypting(true);
    setEncryptedStatus(null);
    setTimeout(() => {
      setEncrypting(false);
      setEncryptedStatus('✓ Record encrypted with AES-256-GCM. Redirecting to Patient Portal...');
      setTimeout(() => {
        router.push('/patient');
      }, 900);
    }, 800);
  };

  return (
    <div className="space-y-20 pb-20 pt-12">
      {/* 1. HERO SECTION & ROLE WORKSPACE (MATCHES REFERENCE IMAGE) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Hero Title & Subtitle */}
        <div className="space-y-4">
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white leading-tight">
            Your health data. <br />
            <span className="text-[#54f2a3]">Your control.</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
            Secure medical records and verifiable insurance claims, powered by encryption and Zero-Knowledge Proofs.
          </p>
        </div>

        {/* Two-Column Interactive Workspace Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Role Selector Card */}
          <div className="lg:col-span-4 p-5 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#54f2a3] font-semibold block mb-3">
                SELECT YOUR ROLE
              </span>
              <div className="space-y-2.5">
                {(['Patient', 'Doctor', 'Hospital', 'Insurer'] as RoleType[]).map((role) => {
                  const isActive = selectedRole === role;
                  return (
                    <button
                      key={role}
                      onClick={() => {
                        setSelectedRole(role);
                        setEncryptedStatus(null);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition border ${
                        isActive
                          ? 'bg-[#0e261f] border-[#175c44] text-[#54f2a3]'
                          : 'bg-[#0a1219] border-[#162532] text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <span>{role}</span>
                      {isActive ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#54f2a3]" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full border border-slate-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Privacy By Design Callout Box */}
            <div className="p-4 rounded-xl border border-[#175c44]/40 bg-[#0e261f]/40 space-y-2">
              <div className="text-sm font-semibold text-[#54f2a3]">
                Privacy by design
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Medical records are encrypted off-chain. Private witness data never goes on-chain.
              </p>
            </div>
          </div>

          {/* Right Column: Portal Interactive Card */}
          <div className="lg:col-span-8 p-6 sm:p-7 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-5">
            {/* Header with Title and Production Ready Badge */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#54f2a3] font-bold block mb-1">
                  {selectedRole.toUpperCase()} PORTAL
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-white">
                  {selectedRole === 'Patient' && 'Patient Dashboard'}
                  {selectedRole === 'Doctor' && 'Doctor Consultations'}
                  {selectedRole === 'Hospital' && 'Hospital Claims Engine'}
                  {selectedRole === 'Insurer' && 'Insurer Underwriting'}
                </h2>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#32230a] border border-[#63430c] text-[#fbbf24] shrink-0 font-mono">
                Production Ready
              </span>
            </div>

            {/* Card Content depending on role */}
            <div className="p-5 rounded-xl border border-[#162734] bg-[#081016] space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {selectedRole === 'Patient' && 'Upload medical record'}
                  {selectedRole === 'Doctor' && 'Decrypted clinical chart review'}
                  {selectedRole === 'Hospital' && 'BabyJubJub EdDSA claim signing'}
                  {selectedRole === 'Insurer' && 'Zero-Knowledge claim verification'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedRole === 'Patient' && 'Your record is encrypted before it is stored.'}
                  {selectedRole === 'Doctor' && 'Access patient diagnosis only after cryptographic permission grant.'}
                  {selectedRole === 'Hospital' && 'Hospital signs the claim without broadcasting private clinical diagnosis.'}
                  {selectedRole === 'Insurer' && 'Verify mathematical validity and policy criteria without seeing medical records.'}
                </p>
              </div>

              {/* Monospace Code Editor Box */}
              <div className="rounded-xl border border-[#172935] bg-[#050b10] p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-56">
                <pre className="text-slate-200">
                  {selectedRole === 'Patient' && sampleJsonPatient}
                  {selectedRole === 'Doctor' && sampleJsonDoctor}
                  {selectedRole === 'Hospital' && sampleJsonHospital}
                  {selectedRole === 'Insurer' && sampleJsonInsurer}
                </pre>
              </div>

              {encryptedStatus && (
                <div className="p-3 rounded-lg bg-[#0e261f] border border-[#175c44] text-xs font-mono text-[#54f2a3] flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {encryptedStatus}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {selectedRole === 'Patient' && (
                  <button
                    onClick={handleEncryptAndUpload}
                    disabled={encrypting}
                    className="px-6 py-2.5 rounded-lg bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:opacity-50 text-[#041c13] font-semibold text-sm transition shadow-sm"
                  >
                    {encrypting ? 'Encrypting and uploading...' : 'Encrypt and upload'}
                  </button>
                )}
                {selectedRole === 'Doctor' && (
                  <Link
                    href="/doctor"
                    className="px-5 py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] text-[#041c13] font-bold text-sm transition shadow-sm shadow-[#54f2a3]/20 flex items-center gap-2"
                  >
                    <span>Open Doctor Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                {selectedRole === 'Hospital' && (
                  <Link
                    href="/hospital"
                    className="px-5 py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] text-[#041c13] font-bold text-sm transition shadow-sm shadow-[#54f2a3]/20 flex items-center gap-2"
                  >
                    <span>Open Hospital Engine</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                {selectedRole === 'Insurer' && (
                  <Link
                    href="/insurer"
                    className="px-5 py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] text-[#041c13] font-bold text-sm transition shadow-sm shadow-[#54f2a3]/20 flex items-center gap-2"
                  >
                    <span>Open Insurer Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}

                <Link
                  href={`/${selectedRole.toLowerCase()}`}
                  className="px-4 py-2.5 rounded-xl border border-[#172935] bg-[#0a1219] hover:bg-[#111e29] text-xs font-semibold text-slate-300 transition"
                >
                  View Full {selectedRole} View
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THREE CORE PILLARS OF MEDVEIL */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0e261f] border border-[#175c44] flex items-center justify-center text-[#54f2a3]">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Zero-Knowledge Proofs</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Circom 2.1 & Groth16 circuit proofs verify policy financial limits, covered procedure codes, and active dates without exposing medical diagnoses.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0e261f] border border-[#175c44] flex items-center justify-center text-[#54f2a3]">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Encrypted Health Vault</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Medical records are encrypted client-side using AES-256-GCM. Patients grant revocable, time-bound decryption permissions to doctors on-chain.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0e261f] border border-[#175c44] flex items-center justify-center text-[#54f2a3]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">BabyJubJub EdDSA Signatures</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hospitals digitally sign treatments on the Jubjub elliptic curve over Poseidon hashes, proving authenticity without disclosing private records.
            </p>
          </div>
        </div>
      </section>

      {/* 3. TECHNICAL SPECIFICATIONS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">Cryptographic Stack</h3>
            <span className="text-xs font-mono text-[#54f2a3]">Chain ID 31337 / Sepolia</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-[#081016] border border-[#162734]">
              <span className="text-slate-500 block text-[10px]">ZK-SNARK ENGINE</span>
              <span className="text-white font-semibold">Circom 2.1 + Groth16</span>
            </div>
            <div className="p-3 rounded-xl bg-[#081016] border border-[#162734]">
              <span className="text-slate-500 block text-[10px]">SIGNATURE CURVE</span>
              <span className="text-[#54f2a3] font-semibold">BabyJubJub EdDSA</span>
            </div>
            <div className="p-3 rounded-xl bg-[#081016] border border-[#162734]">
              <span className="text-slate-500 block text-[10px]">HASH FUNCTION</span>
              <span className="text-white font-semibold">Poseidon (BN254)</span>
            </div>
            <div className="p-3 rounded-xl bg-[#081016] border border-[#162734]">
              <span className="text-slate-500 block text-[10px]">ENCRYPTION</span>
              <span className="text-[#54f2a3] font-semibold">AES-256-GCM</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
