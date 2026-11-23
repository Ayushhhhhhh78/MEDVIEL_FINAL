'use client';

import React, { useState, useEffect } from 'react';
import { Contract } from 'ethers';
import {
  ShieldCheck,
  Building2,
  FileCheck2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { api, getStoredUser } from '../../lib/api';
import { getConnectedSigner } from '../../lib/web3';

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRegistry, setUpdatingRegistry] = useState(false);
  const [registryFeedback, setRegistryFeedback] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [hospRes, auditRes] = await Promise.all([
        api.getHospitals().catch(() => ({ hospitals: [] })),
        api.getAuditLogs().catch(() => ({ logs: [] })),
      ]);
      setHospitals(hospRes.hospitals || []);
      setAuditLogs(auditRes.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateHospitalRegistryOnChain = async () => {
    setUpdatingRegistry(true);
    setRegistryFeedback(null);
    try {
      const config = await api.getHospitalRegistryConfig();
      if (!config.hospitalRegistryAddress) {
        throw new Error('HospitalRegistry address not configured.');
      }

      const { signer } = await getConnectedSigner();
      const hospitalRegistryAbi = [
        'function hospitalMerkleRoot() view returns (uint256)',
        'function updateHospitalMerkleRoot(uint256 _newRoot) external',
      ];

      const contract = new Contract(config.hospitalRegistryAddress, hospitalRegistryAbi, signer);
      const rootToSet = config.currentRoot || '11804371645372837406327410541522092723216478259284212892451202207667058845720';

      const tx = await contract.updateHospitalMerkleRoot(BigInt(rootToSet));
      setRegistryFeedback(`Transaction broadcast: ${tx.hash}. Awaiting confirmation...`);
      const receipt = await tx.wait(1);

      setRegistryFeedback(`✓ Hospital registry Merkle root updated on-chain! Tx: ${receipt.hash}`);
      loadData();
    } catch (err: any) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('rejected'))) {
        setRegistryFeedback('Wallet transaction rejected. Operation cancelled.');
      } else {
        setRegistryFeedback(`Failed to update hospital registry: ${err.message}`);
      }
    } finally {
      setUpdatingRegistry(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. Header */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-[#0e261f] border border-[#175c44] text-[#54f2a3] font-semibold">
              ADMIN GOVERNANCE PORTAL
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Governance &amp; Auditing</h1>
          <p className="text-xs text-slate-400 mt-1">
            Healthcare provider registry management and privacy-preserving audit logs.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="p-3.5 rounded-xl border border-[#172935] bg-[#081016] min-w-[140px]">
            <span className="text-slate-500 block text-[10px] tracking-wider uppercase font-semibold">VERIFIED HOSPITALS</span>
            <span className="text-base font-bold text-[#54f2a3]">{hospitals.length}</span>
          </div>
          <div className="p-3.5 rounded-xl border border-[#172935] bg-[#081016] min-w-[140px]">
            <span className="text-slate-500 block text-[10px] tracking-wider uppercase font-semibold">AUDIT LOGS</span>
            <span className="text-base font-bold text-white">{auditLogs.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Registered Hospitals */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#54f2a3]" />
            Approved Healthcare Providers (HospitalRegistry.sol)
          </h2>
          <button
            onClick={handleUpdateHospitalRegistryOnChain}
            disabled={updatingRegistry}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#54f2a3] text-[#081016] text-xs font-semibold hover:bg-[#45db92] transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updatingRegistry ? 'animate-spin' : ''}`} />
            {updatingRegistry ? 'Updating On-Chain...' : 'Update Registry On-Chain'}
          </button>
        </div>

        {registryFeedback && (
          <div className="p-3 rounded-xl border border-[#172935] bg-[#081016] text-xs font-mono text-[#54f2a3]">
            {registryFeedback}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-[#172935]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4 font-semibold">Hospital Name</th>
                <th className="py-3 px-4 font-semibold">License</th>
                <th className="py-3 px-4 font-semibold">BabyJubJub PubKey Ax</th>
                <th className="py-3 px-4 font-semibold">BabyJubJub PubKey Ay</th>
                <th className="py-3 px-4 font-semibold">Authorized Payout Wallet</th>
                <th className="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60 bg-[#0c161e]">
              {hospitals.map((h) => (
                <tr key={h.id} className="hover:bg-[#11202b]/40 transition">
                  <td className="py-3 px-4 font-medium text-slate-200">{h.name}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{h.license_number}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3] truncate max-w-[140px]">{h.pubkey_ax}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3] truncate max-w-[140px]">{h.pubkey_ay}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-300">{h.payout_address}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#0e261f] text-[#54f2a3] border border-[#175c44]">
                      Approved &amp; Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. System Audit History */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#54f2a3]" />
            System Audit Trail (Zero-Knowledge &amp; Privacy-Safe)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable log of state changes. Sensitive medical notes and private keys are never included in audit records.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#172935]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Entity Type</th>
                <th className="py-3 px-4 font-semibold">Entity ID</th>
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60 bg-[#0c161e]">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#11202b]/40 transition">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{log.created_at}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-[#54f2a3]">{log.action}</td>
                  <td className="py-3 px-4 text-slate-400">{log.entity_type}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">#{log.entity_id}</td>
                  <td className="py-3 px-4 text-slate-300">{log.username || 'System'} ({log.role || 'CORE'})</td>
                  <td className="py-3 px-4 text-slate-300">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
