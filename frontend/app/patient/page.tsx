'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Lock,
  FileText,
  Upload,
  Download,
  UserCheck,
  UserX,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Code2,
} from 'lucide-react';
import { api, getStoredUser } from '../../lib/api';

export default function PatientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadMode, setUploadMode] = useState<'json' | 'file'>('json');
  const [uploadTitle, setUploadTitle] = useState('Laparoscopic Appendectomy Summary');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [jsonContent, setJsonContent] = useState(`{
  "diagnosis": "Acute appendicitis",
  "procedure": "Laparoscopic appendectomy",
  "icd10": "K35.80",
  "prescription": [
    "Cefazolin 1g",
    "Paracetamol 650mg"
  ],
  "note": "Confidential medical record data"
}`);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Grant access state
  const [grantDoctorId, setGrantDoctorId] = useState('1');
  const [grantExpiryDays, setGrantExpiryDays] = useState('30');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recordsRes, claimsRes] = await Promise.all([
        api.getRecords().catch(() => ({ records: [] })),
        api.getClaims().catch(() => ({ claims: [] })),
      ]);
      setRecords(recordsRes.records || []);
      setClaims(claimsRes.claims || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadLoading(true);
    setActionMessage('');

    try {
      const formData = new FormData();
      formData.append('title', uploadTitle || 'Medical Summary Record');

      if (uploadMode === 'json') {
        const blob = new Blob([jsonContent], { type: 'application/json' });
        formData.append('file', blob, `${uploadTitle.replace(/\s+/g, '_')}.json`);
      } else {
        if (!uploadFile) throw new Error('Please select a file to upload');
        formData.append('file', uploadFile);
      }

      formData.append('recordType', 'SURGICAL_SUMMARY');

      await api.uploadRecord(formData);
      setActionMessage('✓ Medical record encrypted with AES-256-GCM and stored off-chain successfully!');
      setUploadFile(null);
      loadData();
    } catch (err: any) {
      if (err.message?.includes('rejected')) {
        setActionMessage('Wallet signature rejected. Operation cancelled.');
      } else {
        setActionMessage(`Upload failed: ${err.message}`);
      }
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDownload = async (recordId: number, title: string) => {
    try {
      const blob = await api.downloadRecord(recordId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}_decrypted.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err.message?.includes('rejected')) {
        setActionMessage('Wallet signature rejected. Operation cancelled.');
      } else {
        alert(`Download/Decryption failed: ${err.message}`);
      }
    }
  };

  const handleGrantAccess = async (recordId: number) => {
    try {
      const expiryTimestamp =
        grantExpiryDays === '0'
          ? 0
          : Math.floor(Date.now() / 1000) + Number(grantExpiryDays) * 86400;

      await api.grantAccess(recordId, {
        doctorId: Number(grantDoctorId),
        expiresAt: expiryTimestamp,
      });
      setActionMessage(`✓ Access successfully granted to Dr. Sharma!`);
      loadData();
    } catch (err: any) {
      if (err.message?.includes('rejected')) {
        setActionMessage('Wallet signature rejected. Operation cancelled.');
      } else {
        alert(`Grant failed: ${err.message}`);
      }
    }
  };

  const handleRevokeAccess = async (recordId: number) => {
    try {
      await api.revokeAccess(recordId, { doctorId: Number(grantDoctorId) });
      setActionMessage(`✓ Access successfully revoked for Dr. Sharma.`);
      loadData();
    } catch (err: any) {
      if (err.message?.includes('rejected')) {
        setActionMessage('Wallet signature rejected. Operation cancelled.');
      } else {
        alert(`Revoke failed: ${err.message}`);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. Header & Policy Banner */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#54f2a3] font-bold">
              PATIENT PORTAL
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-mono">ID: #PAT-RAHUL-01</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Patient Dashboard</h1>
          <p className="text-xs text-slate-400 mt-1">
            Your medical records and insurance claims are cryptographically shielded by Zero-Knowledge proofs.
          </p>
        </div>

        {/* Policy status card */}
        <div className="p-4 rounded-xl border border-[#172935] bg-[#081016] text-xs space-y-1.5 min-w-[260px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-mono text-[10px] uppercase">Registered Policy</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#32230a] border border-[#63430c] text-[#fbbf24] font-mono">
              Production Ready
            </span>
          </div>
          <div className="font-bold text-white text-sm">MediCare National Health</div>
          <div className="flex items-center justify-between text-slate-300 pt-1">
            <span>Policy Limit:</span>
            <span className="font-bold text-[#54f2a3]">₹5,00,000</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>Status:</span>
            <span className="text-[#54f2a3] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#54f2a3]"></span> Active on-chain
            </span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-xl border border-[#175c44] bg-[#0e261f] text-[#54f2a3] text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-[#54f2a3] shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* 2. Privacy Assurance Banner */}
      <div className="p-4 rounded-xl border border-[#172935] bg-[#0c161e] grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="flex items-center gap-2.5 text-slate-300">
          <Lock className="w-4 h-4 text-[#54f2a3] shrink-0" />
          <span>AES-256-GCM envelope encryption before off-chain upload</span>
        </div>
        <div className="flex items-center gap-2.5 text-slate-300">
          <EyeOff className="w-4 h-4 text-[#54f2a3] shrink-0" />
          <span>Diagnoses & surgical details are strictly shielded from insurers</span>
        </div>
        <div className="flex items-center gap-2.5 text-slate-300">
          <ShieldCheck className="w-4 h-4 text-[#54f2a3] shrink-0" />
          <span>Doctor access revocations enforced on blockchain</span>
        </div>
      </div>

      {/* 3. Encrypted Medical Records Section (Matches Reference Image) */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Upload medical record
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Your record is encrypted before it is stored.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#081016] border border-[#172935] text-xs">
            <button
              type="button"
              onClick={() => setUploadMode('json')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                uploadMode === 'json'
                  ? 'bg-[#0e261f] text-[#54f2a3] border border-[#175c44]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              JSON / Text
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('file')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                uploadMode === 'file'
                  ? 'bg-[#0e261f] text-[#54f2a3] border border-[#175c44]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              File Attachment
            </button>
          </div>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Document Identifier / Title</label>
            <input
              type="text"
              required
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. Laparoscopic Appendectomy Summary"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-xs text-slate-200 focus:outline-none focus:border-[#54f2a3]"
            />
          </div>

          {uploadMode === 'json' ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Confidential Clinical Data (Encrypted Client-Side)</label>
              <textarea
                rows={9}
                value={jsonContent}
                onChange={(e) => setJsonContent(e.target.value)}
                className="w-full p-4 rounded-xl bg-[#050b10] border border-[#172935] font-mono text-xs text-slate-200 focus:outline-none focus:border-[#54f2a3] leading-relaxed"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Select File (PDF / Images / Reports)</label>
              <input
                type="file"
                required
                onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:bg-[#0e261f] file:text-[#54f2a3] hover:file:bg-[#14362c] cursor-pointer p-2 bg-[#081016] border border-[#172935] rounded-xl"
              />
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={uploadLoading}
              className="px-6 py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:opacity-50 text-[#041c13] font-bold text-sm transition shadow-sm shadow-[#54f2a3]/20 flex items-center gap-2"
            >
              <Lock className="w-4 h-4 text-[#041c13]" />
              {uploadLoading ? 'Encrypting with AES-256...' : 'Encrypt and upload'}
            </button>
          </div>
        </form>

        {/* Records Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">IPFS CID</th>
                <th className="py-3 px-4">Ciphertext Integrity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No medical records uploaded yet.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#081016]/60 transition">
                    <td className="py-3 px-4 font-semibold text-slate-200">{rec.title}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{rec.recordType}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3]">
                      {rec.ipfsCid?.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {rec.fileHash?.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleDownload(rec.id, rec.title)}
                        className="px-2.5 py-1 rounded-lg bg-[#081016] hover:bg-[#0e261f] hover:text-[#54f2a3] text-slate-300 transition text-[11px] inline-flex items-center gap-1 border border-[#172935]"
                      >
                        <Download className="w-3 h-3" /> Decrypt
                      </button>
                      <button
                        onClick={() => handleGrantAccess(rec.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#0e261f] hover:bg-[#14362c] text-[#54f2a3] border border-[#175c44] transition text-[11px] inline-flex items-center gap-1 font-medium"
                      >
                        <UserCheck className="w-3 h-3" /> Grant Dr. Sharma
                      </button>
                      <button
                        onClick={() => handleRevokeAccess(rec.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 transition text-[11px] inline-flex items-center gap-1"
                      >
                        <UserX className="w-3 h-3" /> Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Claims History */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#54f2a3]" />
            Your Claims & Settlements
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Claims submitted on your behalf by approved hospitals and settled with Zero-Knowledge proofs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4">Claim #</th>
                <th className="py-3 px-4">Hospital</th>
                <th className="py-3 px-4">Claim Amount</th>
                <th className="py-3 px-4">Treatment Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Nullifier (Replay Guard)</th>
                <th className="py-3 px-4">On-Chain Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60">
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No insurance claims submitted yet.
                  </td>
                </tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.id} className="hover:bg-[#081016]/60 transition">
                    <td className="py-3 px-4 font-mono font-medium text-slate-200">{c.claimNumber}</td>
                    <td className="py-3 px-4 text-slate-300">{c.hospitalName}</td>
                    <td className="py-3 px-4 font-bold text-[#54f2a3]">₹{Number(c.claimAmount).toLocaleString()}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono">{c.treatmentDate}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        c.status === 'SETTLED'
                          ? 'bg-[#0e261f] text-[#54f2a3] border border-[#175c44]'
                          : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {c.nullifier ? `${c.nullifier.slice(0, 14)}...` : 'Generating...'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3]">
                      {c.txHash ? `${c.txHash.slice(0, 12)}...` : 'Pending settlement'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
