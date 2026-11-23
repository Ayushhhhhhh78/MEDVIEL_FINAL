'use client';

import React, { useState, useEffect } from 'react';
import { BrowserProvider, Contract, toBeHex } from 'ethers';
import {
  ShieldCheck,
  Lock,
  FileText,
  DollarSign,
  Plus,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  ExternalLink,
  Layers,
  Wallet,
} from 'lucide-react';
import { api, getStoredUser } from '../../lib/api';

const policyRegistryAbi = [
  'function owner() view returns (address)',
  'function authorizedInsurers(address) view returns (bool)',
  'function policyIdToCommitment(uint256) view returns (uint256)',
  'function registerPolicy(uint256,uint256,uint256)',
];

async function connectWalletToChain(chainId: number, network: string) {
  if (!window.ethereum) {
    throw new Error('MetaMask was not detected. Please install the MetaMask browser extension.');
  }
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('The configured blockchain network has an invalid chain ID.');
  }

  await window.ethereum.request({ method: 'eth_requestAccounts' });
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toBeHex(chainId) }],
    });
  } catch (switchError: any) {
    if (switchError.code === 4001) {
      throw new Error('Network switch was cancelled in MetaMask.');
    }
    if (switchError.code !== 4902) throw switchError;
    if (network === 'sepolia') {
      throw new Error('Add the Sepolia test network in MetaMask (Chain ID: 11155111), then retry.');
    }
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: toBeHex(chainId),
        chainName: 'Hardhat Local (Port 8555)',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['http://127.0.0.1:8555'],
      }],
    });
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toBeHex(chainId) }],
    });
  }

  const provider = new BrowserProvider(window.ethereum);
  const currentChainId = Number((await provider.getNetwork()).chainId);
  if (currentChainId !== chainId) {
    throw new Error(`MetaMask is on Chain ID ${currentChainId}; switch to Chain ID ${chainId} and retry.`);
  }

  const accounts: string[] = await window.ethereum.request({ method: 'eth_accounts' });
  if (!accounts[0]) throw new Error('No MetaMask account is currently selected.');
  const signer = await provider.getSigner(accounts[0]);
  return { signer, address: await signer.getAddress() };
}

function getWalletErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const walletError = error as { code?: string | number; shortMessage?: string; message?: string };
    if (walletError.code === 4001 || walletError.code === 'ACTION_REJECTED') {
      return 'Transaction was rejected in MetaMask.';
    }
    return walletError.shortMessage || walletError.message || 'Unknown wallet or transaction error';
  }
  return 'Unknown wallet or transaction error';
}

export default function InsurerDashboard() {
  const [user, setUser] = useState<any>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Policy form state
  const [policyNumber, setPolicyNumber] = useState('POL-MED-6002');
  const [policyLimit, setPolicyLimit] = useState('750000');
  const [expiryDate, setExpiryDate] = useState('20261231');
  const [proceduresInput, setProceduresInput] = useState('7701, 7702, 7703, 7704');
  const [policyActionLoading, setPolicyActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info'>('info');
  const [publishingPolicyId, setPublishingPolicyId] = useState<number | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [walletAuthorizing, setWalletAuthorizing] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [policiesRes, claimsRes] = await Promise.all([
        api.getPolicies().catch(() => ({ policies: [] })),
        api.getClaims().catch(() => ({ claims: [] })),
      ]);
      setPolicies(policiesRes.policies || []);
      setClaims(claimsRes.claims || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setPolicyActionLoading(true);
    setFeedbackMsg('');
    setFeedbackType('info');
    try {
      const procArray = proceduresInput
        .split(',')
        .map((p) => Number(p.trim()))
        .filter((n) => !isNaN(n));

      const res = await api.createPolicy({
        policyNumber,
        policyLimit: Number(policyLimit),
        expiryDate: Number(expiryDate),
        coveredProcedures: procArray,
      });

      setFeedbackType('success');
      setFeedbackMsg(`Policy ${policyNumber} created with cryptographic commitment: ${res.policy.policyCommitment}`);
      loadData();
    } catch (err: any) {
      setFeedbackType('error');
      setFeedbackMsg(`Error creating policy: ${err.message}`);
    } finally {
      setPolicyActionLoading(false);
    }
  };

  const handleConnectAndAuthorizeMetaMask = async () => {
    setWalletAuthorizing(true);
    setFeedbackMsg('');
    setFeedbackType('info');
    try {
      const config = await api.getPolicyRegistryConfig();
      if (!config.policyRegistryAddress) throw new Error('PolicyRegistry is not deployed.');
      const { signer, address } = await connectWalletToChain(Number(config.chainId), config.network);
      const registry = new Contract(config.policyRegistryAddress, policyRegistryAbi, signer);
      const [owner, isAuthorized] = await Promise.all([
        registry.owner(),
        registry.authorizedInsurers(address),
      ]);
      if (!isAuthorized && address.toLowerCase() !== owner.toLowerCase()) {
        await api.authorizeWallet(address);
      }
      if (!(await registry.authorizedInsurers(address))) {
        throw new Error('Wallet authorization was not confirmed on the configured network.');
      }
      setConnectedWallet(address);
      setFeedbackType('success');
      setFeedbackMsg(`✓ Connected ${address.slice(0, 6)}...${address.slice(-4)}. Approve the policy publish transaction in MetaMask when prompted.`);
    } catch (err: unknown) {
      setFeedbackType('error');
      setFeedbackMsg(`MetaMask setup failed: ${getWalletErrorMessage(err)}`);
    } finally {
      setWalletAuthorizing(false);
    }
  };

  const handleRegisterOnChain = async (policyId: number) => {
    setPublishingPolicyId(policyId);
    setFeedbackMsg('');
    setFeedbackType('info');
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask was not detected. Install MetaMask to publish a policy.');
      }

      const policy = policies.find((item) => Number(item.id) === policyId);
      if (!policy) throw new Error('Policy not found. Refresh the dashboard and try again.');

      const config = await api.getPolicyRegistryConfig();
      const chainId = Number(config.chainId);
      if (!Number.isInteger(chainId) || !config.policyRegistryAddress) {
        throw new Error('The PolicyRegistry deployment configuration is invalid.');
      }

      setFeedbackMsg('Connecting MetaMask to the deployed network...');
      const { signer, address: walletAddress } = await connectWalletToChain(chainId, config.network);
      const registry = new Contract(config.policyRegistryAddress, policyRegistryAbi, signer);
      setFeedbackMsg('Checking wallet authorization and policy status on-chain...');
      const [owner, isAuthorized, existingCommitment] = await Promise.all([
        registry.owner(),
        registry.authorizedInsurers(walletAddress),
        registry.policyIdToCommitment(policyId),
      ]);

      if (existingCommitment !== BigInt(0)) {
        if (existingCommitment === BigInt(policy.policy_commitment)) {
          setFeedbackType('success');
          setFeedbackMsg(`Policy ${policy.policy_number} is already registered on-chain; no new MetaMask transaction is needed.`);
          return;
        }
        throw new Error('This policy ID is already registered on-chain with a different commitment.');
      }

      if (!isAuthorized && walletAddress.toLowerCase() !== owner.toLowerCase()) {
        setFeedbackMsg(`Authorizing wallet ${walletAddress.slice(0, 6)}... on-chain via PolicyRegistry...`);
        try {
          const authRes = await api.authorizeWallet(walletAddress);
          if (authRes?.success) {
            setFeedbackMsg(`✓ Wallet authorized on-chain! Confirming in MetaMask...`);
          }
          await new Promise((r) => setTimeout(r, 800));
        } catch (authErr: any) {
          console.warn('Auto-authorize wallet failed:', authErr.message);
        }
      }

      setConnectedWallet(walletAddress);
      setFeedbackMsg('MetaMask is ready. Approve the policy registration transaction in the wallet popup...');
      const tx = await registry.registerPolicy(
        BigInt(policyId),
        BigInt(policy.policy_commitment),
        BigInt(policy.coverage_root)
      );
      setFeedbackMsg(`Transaction submitted (${tx.hash}). Waiting for confirmation...`);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction ${tx.hash} was not confirmed successfully.`);
      }
      setFeedbackType('success');
      setFeedbackMsg(`Policy registered on-chain. Transaction: ${tx.hash}`);
      loadData();
    } catch (err: unknown) {
      const msg = getWalletErrorMessage(err);
      if (msg.includes('Policy commitment already registered') || msg.includes('Policy ID already registered')) {
        setFeedbackType('success');
        setFeedbackMsg(`✓ Policy #${policyId} is already registered and active on-chain!`);
        loadData();
      } else if (msg.includes('Caller not authorized insurer')) {
        setFeedbackType('error');
        setFeedbackMsg(
          `On-chain registration failed: "Caller not authorized insurer". ` +
          `Please click the green "1-Click Relayer" button on this policy to publish it directly via the contract owner relayer!`
        );
      } else {
        setFeedbackType('error');
        setFeedbackMsg(`On-chain registration failed: ${msg}`);
      }
    } finally {
      setPublishingPolicyId(null);
    }
  };

  const handleRegisterViaRelayer = async (policyId: number) => {
    setPublishingPolicyId(policyId);
    setFeedbackMsg('Submitting policy commitment directly on-chain via funded contract relayer...');
    setFeedbackType('info');
    try {
      const res = await api.publishPolicyOnChain(policyId);
      setFeedbackType('success');
      if (res.alreadyRegistered) {
        setFeedbackMsg(`✓ Policy #${res.policyId || policyId} is already registered and active on-chain!`);
      } else {
        setFeedbackMsg(`✓ Policy #${res.policyId} registered on-chain! Tx: ${res.txHash} (Block ${res.blockNumber})`);
      }
      loadData();
    } catch (err: any) {
      if (err.message?.includes('Policy commitment already registered') || err.message?.includes('Policy ID already registered')) {
        setFeedbackType('success');
        setFeedbackMsg(`✓ Policy #${policyId} is already registered and active on-chain!`);
        loadData();
      } else {
        setFeedbackType('error');
        setFeedbackMsg(`Relayer publication failed: ${err.message}`);
      }
    } finally {
      setPublishingPolicyId(null);
    }
  };

  const totalSettled = claims
    .filter((c) => c.status === 'SETTLED')
    .reduce((sum, c) => sum + Number(c.claimAmount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. Header */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-[#0e261f] border border-[#175c44] text-[#54f2a3] font-semibold">
              INSURER PORTAL
            </span>
            <span className="text-xs text-slate-400">IRDAI Licensed Underwriter</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">MediCare National Health Insurance</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Zero-Knowledge claim verification without access to private medical records or intrusive health audits.
          </p>
        </div>

        {/* Stats card */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="p-3.5 rounded-xl border border-[#172935] bg-[#081016] min-w-[140px]">
            <span className="text-slate-500 block text-[10px] tracking-wider uppercase font-semibold">TOTAL SETTLED</span>
            <span className="text-base font-bold text-[#54f2a3]">₹{totalSettled.toLocaleString()}</span>
          </div>
          <div className="p-3.5 rounded-xl border border-[#172935] bg-[#081016] min-w-[140px]">
            <span className="text-slate-500 block text-[10px] tracking-wider uppercase font-semibold">ACTIVE POLICIES</span>
            <span className="text-base font-bold text-white">{policies.length}</span>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          role={feedbackType === 'error' ? 'alert' : 'status'}
          className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
            feedbackType === 'error'
              ? 'border-red-800/80 bg-red-950/40 text-red-200'
              : feedbackType === 'success'
                ? 'border-[#175c44] bg-[#0e261f] text-[#54f2a3]'
                : 'border-[#172935] bg-[#081016] text-slate-200'
          }`}
        >
          {feedbackType === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#54f2a3] shrink-0" />
          )}
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* 2. Privacy Guarantee Pill */}
      <div className="p-4 rounded-xl border border-[#175c44]/40 bg-[#0e261f]/30 text-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-slate-300">
          <EyeOff className="w-5 h-5 text-[#54f2a3] shrink-0" />
          <span>
            <strong className="text-white">Insurer Privacy Shield Active:</strong> Sensitive clinical details, procedure codes, and complete patient medical records are strictly omitted from insurer API payloads. Claims are mathematically verified via Groth16.
          </span>
        </div>
        <span className="px-2.5 py-1 rounded bg-[#0e261f] border border-[#175c44] text-[10px] font-mono text-[#54f2a3] uppercase font-semibold shrink-0">
          ZK-Proof Enforced
        </span>
      </div>

      {/* 3. Submitted Claims for Verification */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#54f2a3]" />
            Verified Incoming Claims
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Claims submitted by authorized hospitals. All conditions (procedure coverage, financial limits, and active dates) are verified by the smart contract verifier.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#172935]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4 font-semibold">Claim #</th>
                <th className="py-3 px-4 font-semibold">Patient Reference</th>
                <th className="py-3 px-4 font-semibold">Hospital Provider</th>
                <th className="py-3 px-4 font-semibold">Claim Amount</th>
                <th className="py-3 px-4 font-semibold">Treatment Date</th>
                <th className="py-3 px-4 font-semibold">Clinical Diagnosis</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Nullifier</th>
                <th className="py-3 px-4 font-semibold">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60 bg-[#0c161e]">
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-mono">
                    No claims submitted to review.
                  </td>
                </tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.id} className="hover:bg-[#11202b]/40 transition">
                    <td className="py-3 px-4 font-mono font-medium text-slate-200">{c.claimNumber}</td>
                    <td className="py-3 px-4 text-slate-300">{c.patientName}</td>
                    <td className="py-3 px-4 text-slate-300">{c.hospitalName}</td>
                    <td className="py-3 px-4 font-semibold text-[#54f2a3]">₹{Number(c.claimAmount).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{c.treatmentDate}</td>
                    <td className="py-3 px-4">
                      {/* Zero-Knowledge Shield */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#081016] text-slate-300 border border-[#172935] flex items-center gap-1.5 w-fit">
                        <EyeOff className="w-3 h-3 text-[#54f2a3]" /> Shielded in ZK Proof
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        c.status === 'SETTLED'
                          ? 'bg-[#0e261f] text-[#54f2a3] border border-[#175c44]'
                          : 'bg-[#32230a] text-[#fbbf24] border border-[#63430c]'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {c.nullifier ? `${c.nullifier.slice(0, 12)}...` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3]">
                      {c.txHash ? `${c.txHash.slice(0, 10)}...` : 'Unsettled'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Policy Management Section */}
      <div className="p-6 rounded-2xl border border-[#172935] bg-[#0c161e] space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#54f2a3]" />
            Underwriting &amp; Cryptographic Policy Commitments
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Define coverage terms and publish Poseidon commitments on-chain. Publishing opens MetaMask for wallet approval.
          </p>
        </div>

        {/* MetaMask Connection & Authorization Card */}
        <div className="p-4 rounded-xl border border-[#172935] bg-[#081016] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#54f2a3]" />
              <span className="text-xs font-bold text-white">MetaMask On-Chain Publisher</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0e261f] border border-[#175c44] text-[#54f2a3]">
                Network: {connectedWallet ? 'Connected' : 'Wallet required'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {connectedWallet
                ? `Connected: ${connectedWallet.slice(0, 8)}...${connectedWallet.slice(-6)} (Authorized in PolicyRegistry)`
                : `Connect MetaMask to switch network to port 8555 and auto-authorize your address for on-chain publishing.`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectAndAuthorizeMetaMask}
            disabled={walletAuthorizing}
            className="px-3.5 py-2 rounded-lg bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:bg-[#175c44] disabled:text-slate-400 text-[#041c13] font-semibold text-xs transition flex items-center gap-2 shrink-0 shadow-sm"
          >
            <Wallet className="w-3.5 h-3.5" />
            {walletAuthorizing ? 'Authorizing...' : (connectedWallet ? 'Re-Authorize Wallet' : '1-Click Connect & Authorize MetaMask')}
          </button>
        </div>

        {/* Policy creation form */}
        <form onSubmit={handleCreatePolicy} className="p-5 rounded-xl border border-[#172935] bg-[#081016] grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Policy Identifier</label>
            <input
              type="text"
              required
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0c161e] border border-[#172935] text-xs text-slate-200 focus:outline-none focus:border-[#54f2a3] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Policy Limit (INR)</label>
            <input
              type="number"
              required
              value={policyLimit}
              onChange={(e) => setPolicyLimit(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0c161e] border border-[#172935] text-xs text-slate-200 focus:outline-none focus:border-[#54f2a3] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Expiry Date (YYYYMMDD)</label>
            <input
              type="number"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0c161e] border border-[#172935] text-xs text-slate-200 focus:outline-none focus:border-[#54f2a3] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Covered Procedure Codes</label>
            <input
              type="text"
              required
              value={proceduresInput}
              onChange={(e) => setProceduresInput(e.target.value)}
              placeholder="7701, 7702, 7703"
              className="w-full px-3 py-2 rounded-lg bg-[#0c161e] border border-[#172935] text-xs text-slate-200 focus:outline-none focus:border-[#54f2a3] transition"
            />
          </div>

          <div className="md:col-span-4 flex justify-end pt-2">
            <button
              type="submit"
              disabled={policyActionLoading}
              className="px-4 py-2 rounded-lg bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:bg-[#175c44] text-[#041c13] font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              {policyActionLoading ? 'Computing Merkle Tree...' : 'Create Policy Commitment'}
            </button>
          </div>
        </form>

        {/* Existing Policies Table */}
        <div className="overflow-x-auto rounded-xl border border-[#172935]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081016] text-slate-400 uppercase font-mono text-[10px] border-b border-[#172935]">
              <tr>
                <th className="py-3 px-4 font-semibold">Policy #</th>
                <th className="py-3 px-4 font-semibold">Limit (INR)</th>
                <th className="py-3 px-4 font-semibold">Expiry</th>
                <th className="py-3 px-4 font-semibold">Coverage Merkle Root</th>
                <th className="py-3 px-4 font-semibold">Policy Commitment (On-Chain)</th>
                <th className="py-3 px-4 font-semibold">On-Chain Status</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172935]/60 bg-[#0c161e]">
              {policies.map((p) => {
                const isPublished = Boolean(p.isOnChainActive);
                return (
                  <tr key={p.id} className="hover:bg-[#11202b]/40 transition">
                    <td className="py-3 px-4 font-mono font-medium text-slate-200">{p.policy_number}</td>
                    <td className="py-3 px-4 font-semibold text-[#54f2a3]">₹{Number(p.policy_limit).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{p.expiry_date}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[140px]">
                      {p.coverage_root?.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#54f2a3] truncate max-w-[180px]">
                      {p.policy_commitment?.slice(0, 20)}...
                    </td>
                    <td className="py-3 px-4">
                      {isPublished ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#0e261f] text-[#54f2a3] border border-[#175c44]">
                          <CheckCircle2 className="w-3 h-3 text-[#54f2a3]" /> Active On-Chain
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#32230a] text-[#fbbf24] border border-[#63430c]">
                          <AlertCircle className="w-3 h-3 text-[#fbbf24]" /> Pending On-Chain
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isPublished ? (
                          <span className="text-[11px] font-mono text-[#54f2a3] font-semibold px-2.5 py-1 bg-[#0e261f] rounded border border-[#175c44]">
                            Synced
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleRegisterOnChain(p.id)}
                              disabled={publishingPolicyId !== null}
                              className="px-2.5 py-1 rounded bg-[#081016] border border-[#172935] hover:border-[#175c44] hover:text-[#54f2a3] disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-[11px] font-medium transition"
                              title="Publish on-chain using your connected MetaMask wallet"
                            >
                              {publishingPolicyId === Number(p.id) ? 'Check MetaMask...' : 'Publish (MetaMask)'}
                            </button>
                            <button
                              onClick={() => handleRegisterViaRelayer(p.id)}
                              disabled={publishingPolicyId !== null}
                              className="px-2.5 py-1 rounded bg-[#0e261f] hover:bg-[#13382c] text-[#54f2a3] border border-[#175c44] disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-semibold transition"
                              title="Publish directly on-chain via the pre-funded contract owner relayer"
                            >
                              1-Click Relayer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
