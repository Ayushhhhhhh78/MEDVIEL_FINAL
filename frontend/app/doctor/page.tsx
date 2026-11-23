'use client';

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  FileText,
  Download,
  Lock,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { api, getStoredUser } from '../../lib/api';

export default function DoctorDashboard() {
  const [user, setUser] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordContent, setSelectedRecordContent] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    loadRecords();
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await api.getRecords();
      setRecords(res.records || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecryptView = async (recordId: number, title: string) => {
    try {
      const blob = await api.downloadRecord(recordId);
      const text = await blob.text();
      setSelectedRecordContent(text);
    } catch (err: any) {
      if (err.message?.includes('rejected')) {
        alert('Wallet signature rejected. Operation cancelled.');
      } else {
        alert(`Access Check Failed: ${err.message}`);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. Doctor Header */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#54f2a3] font-bold">
              DOCTOR PORTAL
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-mono">License: MCI-SURG-7712</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Doctor Consultations</h1>
          <p className="text-xs text-slate-400 mt-1">
            General Surgery & Laparoscopy • Affiliated: Apollo Synthetic Hospital
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#32230a] border border-[#63430c] text-[#fbbf24] font-mono">
            Production Ready
          </span>
          <div className="p-3.5 rounded-xl border border-[#175c44] bg-[#0e261f] text-xs text-[#54f2a3] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#54f2a3] shrink-0" />
            <span className="font-semibold">Patient-Authorized Reader</span>
          </div>
        </div>
      </div>

      {/* 2. Accessible Records Table */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Patient Clinical Records Granted to You
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            These records have active patient-granted decryption capabilities registered in PatientAccess.sol.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4">Record Title</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Storage CID</th>
                <th className="py-3 px-4">Integrity Hash</th>
                <th className="py-3 px-4">Access Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No active medical record permissions currently granted by patients.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-[#081016]/60 transition">
                    <td className="py-3 px-4 font-semibold text-slate-200">{r.title}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{r.recordType}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3]">
                      {r.ipfsCid?.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {r.fileHash?.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0e261f] text-[#54f2a3] border border-[#175c44] flex items-center gap-1 w-fit font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-[#54f2a3]" /> Authorized
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDecryptView(r.id, r.title)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] text-[#041c13] transition text-xs font-bold shadow-sm shadow-[#54f2a3]/20"
                      >
                        Decrypt & View Summary
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal / Inline Decrypted Content Viewer */}
        {selectedRecordContent && (
          <div className="p-6 rounded-2xl border border-[#172935] bg-[#081016] space-y-4">
            <div className="flex items-center justify-between border-b border-[#172935] pb-3">
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#54f2a3]" />
                Decrypted Clinical Summary (AES-256-GCM Verified)
              </div>
              <button
                onClick={() => setSelectedRecordContent(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-[#0c161e] border border-[#172935]"
              >
                Close Viewer
              </button>
            </div>
            <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap bg-[#050b10] p-4 rounded-xl border border-[#172935] max-h-64 overflow-y-auto leading-relaxed">
              {selectedRecordContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
