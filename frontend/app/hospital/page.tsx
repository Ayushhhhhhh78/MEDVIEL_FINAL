'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  FileKey,
  Cpu,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  EyeOff,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Contract } from 'ethers';
import { api, getStoredUser, setToken, setStoredUser } from '../../lib/api';
import { getConnectedSigner, switchToSepoliaChain, getSepoliaLowFeeOverrides, SEPOLIA_CHAIN_ID } from '../../lib/web3';
import ClaimProgressStepper from '../../components/ClaimProgressStepper';

export default function HospitalDashboard() {
  const [user, setUser] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [patientId, setPatientId] = useState('1');
  const [policyId, setPolicyId] = useState('5001');
  const [claimAmount, setClaimAmount] = useState('250000');
  const [treatmentDate, setTreatmentDate] = useState('20260515');
  const [procedureCode, setProcedureCode] = useState('7701');

  // Interactive workflow state
  const [activeClaimId, setActiveClaimId] = useState<number | null>(null);
  const [activeClaimStatus, setActiveClaimStatus] = useState<string>('DRAFT');
  const [workflowLog, setWorkflowLog] = useState<string[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [proofDetails, setProofDetails] = useState<any>(null);
  const [settlementNetwork, setSettlementNetwork] = useState<'sepolia' | 'local'>('sepolia');

  useEffect(() => {
    initAuthAndLoad();
  }, []);

  const initAuthAndLoad = async () => {
    let currentUser = getStoredUser();
    if (!currentUser || currentUser.role !== 'HOSPITAL') {
      try {
        const loginRes = await api.login({ identifier: 'apollo_hospital', password: 'Password123!' });
        setToken(loginRes.token);
        setStoredUser(loginRes.user);
        currentUser = loginRes.user;
      } catch (e) {
        console.warn('Auto-login as apollo_hospital failed:', e);
      }
    }
    setUser(currentUser);
    loadClaims();
  };

  const loadClaims = async () => {
    try {
      const res = await api.getClaims();
      setClaims(res.claims || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg: string) => {
    setWorkflowLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorkflowLoading(true);
    addLog(`Creating draft claim for patient ID ${patientId}...`);

    try {
      const res = await api.createClaim({
        patientId: Number(patientId),
        policyId: Number(policyId),
        claimAmount: Number(claimAmount),
        treatmentDate: Number(treatmentDate),
        procedureCode: Number(procedureCode),
      });

      const newId = res.claim.id;
      setActiveClaimId(newId);
      setActiveClaimStatus('DRAFT');
      addLog(`✓ Draft claim created successfully. Claim Number: ${res.claim.claim_number}`);
      loadClaims();
    } catch (err: any) {
      addLog(`✗ Error: ${err.message}`);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleSignClaim = async () => {
    if (!activeClaimId) return;
    setWorkflowLoading(true);
    try {
      addLog(`Signing claim using hospital's BabyJubJub EdDSA private seed...`);
      const res = await api.signClaim(activeClaimId);
      setActiveClaimStatus('SIGNED');
      addLog(`✓ EdDSA signature created over Poseidon claim hash: ${res.claimHash}`);
      loadClaims();
    } catch (err: any) {
      addLog(`✗ Signing failed: ${err.message}`);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleGenerateProof = async () => {
    if (!activeClaimId) return;
    setWorkflowLoading(true);
    try {
      addLog(`Backend independently verifying hospital EdDSA signature...`);
      addLog(`Compiling Circom witness with hospital Merkle proof & procedure coverage tree...`);
      addLog(`Executing Groth16 snarkjs proving system...`);

      const res = await api.generateProof(activeClaimId);
      setActiveClaimStatus('PROOF_GENERATED');
      setProofDetails(res.publicSignals);
      addLog(`✓ Groth16 Zero-Knowledge proof generated in <1s!`);
      addLog(`✓ Deterministic Claim Nullifier: ${res.nullifier}`);
      loadClaims();
    } catch (err: any) {
      addLog(`✗ Proof generation failed: ${err.message}`);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleVerifyProofLocally = async () => {
    if (!activeClaimId) return;
    setWorkflowLoading(true);
    try {
      addLog(`Verifying proof locally using verification_key.json...`);
      const res = await api.verifyProof(activeClaimId);
      setActiveClaimStatus('PROOF_VERIFIED');
      addLog(`✓ Local verification PASSED: Proof is mathematically valid and satisfies all R1CS constraints.`);
      loadClaims();
    } catch (err: any) {
      addLog(`✗ Local verification failed: ${err.message}`);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleSubmitOnChain = async () => {
    if (!activeClaimId) return;
    setWorkflowLoading(true);
    try {
      addLog(`Preparing Groth16 calldata tuple [a, b, c, input]...`);
      const calldataRes = await api.getClaimCalldata(activeClaimId);
      const { calldata, claimSettlementAddress } = calldataRes;

      if (typeof window !== 'undefined' && window.ethereum) {
        if (settlementNetwork === 'sepolia') {
          addLog(`[Network] Ensuring MetaMask is connected to Sepolia testnet (Chain ID 11155111)...`);
          try {
            await switchToSepoliaChain();
            addLog(`✓ MetaMask connected to Sepolia test network`);
          } catch (netErr: any) {
            addLog(`! Sepolia switch notice: ${netErr.message}`);
          }
        }

        const { signer, provider } = await getConnectedSigner();
        const network = await provider.getNetwork();
        const isSepolia = Number(network.chainId) === SEPOLIA_CHAIN_ID || settlementNetwork === 'sepolia';

        let gasOverrides: any = {};
        if (isSepolia) {
          addLog(`[Gas Optimization] Calculating SepoliaETH Low Fees (EIP-1559 base + priority fee)...`);
          gasOverrides = await getSepoliaLowFeeOverrides(provider as any);
          const maxGwei = (Number(gasOverrides.maxFeePerGas) / 1e9).toFixed(2);
          const prioGwei = (Number(gasOverrides.maxPriorityFeePerGas) / 1e9).toFixed(2);
          addLog(`✓ Applied SepoliaETH Low Fees: maxFee ~${maxGwei} Gwei, priorityFee ~${prioGwei} Gwei (Gas Limit: ${gasOverrides.gasLimit})`);
        }

        addLog(`Requesting MetaMask transaction confirmation for ClaimSettlement on ${isSepolia ? 'SepoliaETH (Low Fees)' : 'Localhost'}...`);
        const settlementAbi = [
          'function verifyAndSettleClaim(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[7] input) external returns (bool)'
        ];
        const settlementContract = new Contract(claimSettlementAddress, settlementAbi, signer);

        const tx = await settlementContract.verifyAndSettleClaim(
          calldata.a,
          calldata.b,
          calldata.c,
          calldata.input,
          gasOverrides
        );
        addLog(`✓ Transaction broadcast on-chain: ${tx.hash}. Awaiting confirmation...`);
        const receipt = await tx.wait(1);

        const res = await api.submitClaim(activeClaimId, { txHash: receipt.hash, blockNumber: receipt.blockNumber });
        setActiveClaimStatus('SETTLED');
        addLog(`✓ SETTLED ON-CHAIN! Tx: ${receipt.hash}`);
        if (Number(network.chainId) === SEPOLIA_CHAIN_ID) {
          addLog(`✓ View on Sepolia Etherscan: https://sepolia.etherscan.io/tx/${receipt.hash}`);
        }
        addLog(`✓ Claim settled via MetaMask transaction in block ${receipt.blockNumber}!`);
        loadClaims();
      } else {
        const res = await api.submitClaim(activeClaimId);
        setActiveClaimStatus('SETTLED');
        addLog(`✓ SETTLED ON-CHAIN via Relayer! Tx: ${res.txHash}`);
        addLog(`✓ Settlement: ₹${Number(res.settlementAmount).toLocaleString()} MVT tokens transferred to registered payout address!`);
        loadClaims();
      }
    } catch (err: any) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('rejected'))) {
        addLog(`✗ Wallet transaction rejected. Operation cancelled.`);
      } else {
        addLog(`✗ Blockchain submission failed: ${err.message}`);
      }
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleAutoRun = async () => {
    setWorkflowLoading(true);
    setWorkflowLog([]);
    setProofDetails(null);

    try {
      const currentUser = getStoredUser();
      if (!currentUser || currentUser.role !== 'HOSPITAL') {
        addLog(`Authenticating as authorized provider (apollo_hospital)...`);
        const loginRes = await api.login({ identifier: 'apollo_hospital', password: 'Password123!' });
        setToken(loginRes.token);
        setStoredUser(loginRes.user);
        setUser(loginRes.user);
        addLog(`✓ Authenticated as Apollo Synthetic Hospital (Provider #101)`);
      }

      addLog(`[1/5] Creating draft claim...`);
      const createRes = await api.createClaim({
        patientId: Number(patientId),
        policyId: Number(policyId),
        claimAmount: Number(claimAmount),
        treatmentDate: Number(treatmentDate),
        procedureCode: Number(procedureCode),
      });
      const cid = createRes.claim.id;
      setActiveClaimId(cid);
      setActiveClaimStatus('DRAFT');
      addLog(`✓ Claim #${createRes.claim.claim_number} created`);

      addLog(`[2/5] Hospital signing with BabyJubJub EdDSA...`);
      await api.signClaim(cid);
      setActiveClaimStatus('SIGNED');
      addLog(`✓ EdDSA signature generated on curve (R8x, R8y, S)`);

      addLog(`[3/5] Generating Groth16 SNARK proof in Circom...`);
      const proofRes = await api.generateProof(cid);
      setActiveClaimStatus('PROOF_GENERATED');
      setProofDetails(proofRes.publicSignals);
      addLog(`✓ Groth16 proof ready. Nullifier: ${proofRes.nullifier.slice(0, 16)}...`);

      addLog(`[4/5] Verifying proof locally against verification_key.json...`);
      await api.verifyProof(cid);
      setActiveClaimStatus('PROOF_VERIFIED');
      addLog(`✓ Local verification passed`);

      addLog(`[5/5] Submitting proof to smart contract on-chain...`);
      const subRes = await api.submitClaim(cid);
      setActiveClaimStatus('SETTLED');
      addLog(`✓ SETTLED ON-CHAIN! Tx: ${subRes.txHash}`);
      addLog(`✓ ₹${Number(subRes.settlementAmount).toLocaleString()} MVT tokens sent to registered hospital payout address!`);

      loadClaims();
    } catch (err: any) {
      addLog(`✗ Pipeline failed: ${err.message}`);
    } finally {
      setWorkflowLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. Hospital Header */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#54f2a3] font-bold">
              HOSPITAL PORTAL
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-[#54f2a3] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved in HospitalRegistry.sol
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Hospital Claims Engine</h1>
          <p className="text-xs text-slate-400 mt-1">
            License: <span className="font-mono text-slate-300">APOLLO-DELHI-9921</span> • Payout Wallet: <span className="font-mono text-[#54f2a3]">0x3C44...93BC</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#32230a] border border-[#63430c] text-[#fbbf24] font-mono">
            Production Ready
          </span>
          <button
            onClick={handleAutoRun}
            disabled={workflowLoading}
            className="px-4 py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:opacity-50 text-[#041c13] font-bold text-xs transition shadow-sm shadow-[#54f2a3]/20 flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {workflowLoading ? 'Processing...' : '1-Click Auto Claim Demo'}
          </button>
        </div>
      </div>

      {/* 2. Interactive Workflow Execution Panel */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#54f2a3]" />
            Cryptographic Claim Lifecycle
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real Zero-Knowledge SNARK pipeline executing EdDSA signatures, Circom witness constraints, and Solidity settlement.
          </p>
        </div>

        {/* Visual Stepper */}
        <ClaimProgressStepper currentStatus={activeClaimStatus} />

        {/* Step Trigger Buttons */}
        <div className="p-4 rounded-xl border border-[#172935] bg-[#081016] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSignClaim}
              disabled={workflowLoading || activeClaimStatus !== 'DRAFT'}
              className="px-3 py-1.5 rounded-lg border border-[#175c44] bg-[#0e261f] text-[#54f2a3] hover:bg-[#14362c] disabled:opacity-40 transition flex items-center gap-1.5 font-semibold"
            >
              <FileKey className="w-3.5 h-3.5" /> 1. EdDSA Sign
            </button>
            <button
              onClick={handleGenerateProof}
              disabled={workflowLoading || activeClaimStatus !== 'SIGNED'}
              className="px-3 py-1.5 rounded-lg border border-[#175c44] bg-[#0e261f] text-[#54f2a3] hover:bg-[#14362c] disabled:opacity-40 transition flex items-center gap-1.5 font-semibold"
            >
              <Cpu className="w-3.5 h-3.5" /> 2. Generate ZK Proof
            </button>
            <button
              onClick={handleVerifyProofLocally}
              disabled={workflowLoading || activeClaimStatus !== 'PROOF_GENERATED'}
              className="px-3 py-1.5 rounded-lg border border-[#175c44] bg-[#0e261f] text-[#54f2a3] hover:bg-[#14362c] disabled:opacity-40 transition flex items-center gap-1.5 font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> 3. Verify Locally
            </button>
            <button
              onClick={handleSubmitOnChain}
              disabled={workflowLoading || activeClaimStatus !== 'PROOF_VERIFIED'}
              className="px-3.5 py-1.5 rounded-lg bg-[#54f2a3] hover:bg-[#6ef5b4] text-[#041c13] font-bold disabled:opacity-40 transition flex items-center gap-1.5 shadow-sm shadow-[#54f2a3]/20"
            >
              <Send className="w-3.5 h-3.5" /> 4. Submit & Settle On-Chain {settlementNetwork === 'sepolia' ? '(SepoliaETH Low Fees)' : ''}
            </button>
          </div>

          {/* Network Selection for On-Chain Settlement */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] bg-[#050b10] p-1 rounded-lg border border-[#172935]">
            <span className="text-slate-400 px-2 text-[10px] uppercase font-semibold">Settlement:</span>
            <button
              type="button"
              onClick={() => setSettlementNetwork('sepolia')}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                settlementNetwork === 'sepolia'
                  ? 'bg-[#175c44] text-[#54f2a3] border border-[#175c44]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              SepoliaETH (Low Fees)
            </button>
            <button
              type="button"
              onClick={() => setSettlementNetwork('local')}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                settlementNetwork === 'local'
                  ? 'bg-[#175c44] text-[#54f2a3] border border-[#175c44]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hardhat Local (8555)
            </button>
          </div>
        </div>

        {/* Live Execution Console */}
        <div className="p-4 rounded-xl border border-[#172935] bg-[#050b10] font-mono text-[11px] text-[#54f2a3] space-y-1 max-h-48 overflow-y-auto">
          <div className="text-slate-500 pb-1 border-b border-[#172935]">Console Log • Real Cryptographic Operations:</div>
          {workflowLog.length === 0 ? (
            <div className="text-slate-600 italic">No operations started. Click "1-Click Auto Claim Demo" or submit a claim below.</div>
          ) : (
            workflowLog.map((log, idx) => <div key={idx}>{log}</div>)
          )}
        </div>

        {/* Public Signals Display */}
        {proofDetails && (
          <div className="p-4 rounded-xl border border-[#175c44] bg-[#0e261f] text-xs space-y-2">
            <div className="font-bold text-[#54f2a3] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Exported Public Signals (Submitted to On-Chain Verifier):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px] text-slate-300">
              <div>claimAmount: <span className="text-[#54f2a3] font-bold">₹{proofDetails.claimAmount}</span></div>
              <div>treatmentDate: <span className="text-white">{proofDetails.treatmentDate}</span></div>
              <div className="truncate">hospitalRegistryRoot: <span className="text-slate-400">{proofDetails.hospitalRegistryRoot}</span></div>
              <div className="truncate">policyCommitment: <span className="text-slate-400">{proofDetails.policyCommitment}</span></div>
              <div className="truncate">claimNullifier: <span className="text-[#54f2a3]">{proofDetails.claimNullifier}</span></div>
              <div className="truncate">hospitalAx: <span className="text-slate-400">{proofDetails.hospitalAx}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Create Claim Form */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">Create New Healthcare Claim</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit a treatment claim. The private surgical code will never be revealed to the insurer or blockchain.
          </p>
        </div>

        <form onSubmit={handleCreateClaim} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-slate-200 text-xs focus:outline-none focus:border-[#54f2a3]"
            >
              <option value="1">Rahul Sharma (Policy #POL-MED-5001)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Claim Amount (INR)</label>
            <input
              type="number"
              required
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-slate-200 text-xs focus:outline-none focus:border-[#54f2a3]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Treatment Date (YYYYMMDD)</label>
            <input
              type="number"
              required
              value={treatmentDate}
              onChange={(e) => setTreatmentDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-slate-200 text-xs focus:outline-none focus:border-[#54f2a3]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Private Procedure Code <span className="text-[#54f2a3] font-mono">(Private Witness)</span>
            </label>
            <select
              value={procedureCode}
              onChange={(e) => setProcedureCode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-slate-200 text-xs focus:outline-none focus:border-[#54f2a3]"
            >
              <option value="7701">7701 — Laparoscopic Appendectomy (Covered)</option>
              <option value="7702">7702 — Cholecystectomy (Covered)</option>
              <option value="7703">7703 — Knee Arthroscopy (Covered)</option>
              <option value="9999">9999 — Cosmetic Rhinoplasty (Not Covered - Will Fail ZK Proof)</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={workflowLoading}
              className="w-full py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:opacity-50 text-[#041c13] font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm shadow-[#54f2a3]/20"
            >
              Initialize Claim
            </button>
          </div>
        </form>

        <div className="p-3.5 rounded-xl bg-[#081016] border border-[#172935] text-xs text-slate-400 flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-[#54f2a3] shrink-0" />
          <span>
            <strong>Zero-Knowledge Guarantee:</strong> Procedure code {procedureCode} will only be used inside the Circom witness to calculate the Merkle path. It will NOT be sent to the insurer or included in public contract inputs.
          </span>
        </div>
      </div>

      {/* 4. Submitted Claims Table */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-4">
        <h2 className="text-xl font-bold text-white">Hospital Claim History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4">Claim #</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Claim Amount</th>
                <th className="py-3 px-4">Procedure</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Nullifier</th>
                <th className="py-3 px-4">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60">
              {claims.map((c) => (
                <tr key={c.id} className="hover:bg-[#081016]/60 transition">
                  <td className="py-3 px-4 font-mono font-medium text-slate-200">{c.claimNumber}</td>
                  <td className="py-3 px-4 text-slate-300">{c.patientName}</td>
                  <td className="py-3 px-4 font-bold text-[#54f2a3]">₹{Number(c.claimAmount).toLocaleString()}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">Code {c.procedureCode || '7701'}</td>
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
                    {c.nullifier ? `${c.nullifier.slice(0, 14)}...` : 'Pending'}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3]">
                    {c.txHash ? `${c.txHash.slice(0, 12)}...` : 'Unsettled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
