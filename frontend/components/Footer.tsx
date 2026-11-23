import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, ExternalLink, Cpu } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-[#172935] bg-[#070d12] text-slate-400 py-12 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Col 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#54f2a3]" />
            <span className="font-bold text-slate-100 tracking-wider">MEDVEIL</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Private Healthcare. Verifiable Claims. Zero-Knowledge proofs for healthcare insurance settlements without exposing patient medical data.
          </p>
          <div className="flex items-center gap-2 text-[11px] text-[#54f2a3] font-mono">
            <span className="w-2 h-2 rounded-full bg-[#54f2a3] animate-pulse"></span>
            Groth16 Verifier Active
          </div>
        </div>

        {/* Col 2 */}
        <div>
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">Core Cryptography</h4>
          <ul className="space-y-2 text-xs">
            <li>Circom 2.1 & Groth16 Snarks</li>
            <li>BabyJubJub EdDSA Signatures</li>
            <li>Poseidon Cryptographic Hashing</li>
            <li>Deterministic Claim Nullifiers</li>
            <li>AES-256-GCM Envelope Encryption</li>
          </ul>
        </div>

        {/* Col 3 */}
        <div>
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">Protocols & Contracts</h4>
          <ul className="space-y-2 text-xs">
            <li>Solidity 0.8.20 + viaIR</li>
            <li>Groth16Verifier.sol</li>
            <li>HospitalRegistry.sol</li>
            <li>PolicyRegistry.sol</li>
            <li>ClaimSettlement.sol</li>
            <li>PatientAccess.sol</li>
          </ul>
        </div>

        {/* Col 4 */}
        <div>
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">Prototype Disclosure</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Hackathon MVP with synthetic patient records. Settlement utilizes test tokens on local Hardhat / Polygon Amoy testnet. Never submit real confidential medical records or live insurance funds.
          </p>
          <div className="mt-3 text-[11px] text-slate-500 font-mono">
            © 2026 MEDVEIL Protocol
          </div>
        </div>
      </div>
    </footer>
  );
}
