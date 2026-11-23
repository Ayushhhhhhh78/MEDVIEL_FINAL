'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Lock, User, Wallet, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, setToken, setStoredUser } from '../../lib/api';
import { connectWallet, signChallengeMessage } from '../../lib/web3';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login({ identifier, password });
      setToken(res.token);
      setStoredUser(res.user);

      // Redirect based on role
      redirectToDashboard(res.user.role);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (roleUsername: string) => {
    setIdentifier(roleUsername);
    setPassword(roleUsername === 'admin' ? 'AdminPassword123!' : 'Password123!');
    setError('');
    setLoading(true);

    try {
      const res = await api.login({
        identifier: roleUsername,
        password: roleUsername === 'admin' ? 'AdminPassword123!' : 'Password123!',
      });
      setToken(res.token);
      setStoredUser(res.user);
      redirectToDashboard(res.user.role);
    } catch (err: any) {
      setError(err.message || 'Quick login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const { address } = await connectWallet();
      const challenge = await api.getWalletChallenge(address);
      const signature = await signChallengeMessage(challenge.message);

      const res = await api.verifyWallet({
        address,
        signature,
        message: challenge.message,
      });

      setToken(res.token);
      setStoredUser(res.user);
      redirectToDashboard(res.user.role);
    } catch (err: any) {
      setError(err.message || 'Wallet authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const redirectToDashboard = (role: string) => {
    switch (role) {
      case 'PATIENT':
        router.push('/patient');
        break;
      case 'HOSPITAL':
        router.push('/hospital');
        break;
      case 'INSURER':
        router.push('/insurer');
        break;
      case 'DOCTOR':
        router.push('/doctor');
        break;
      case 'ADMIN':
        router.push('/admin');
        break;
      default:
        router.push('/');
    }
  };

  return (
    <div className="max-w-md mx-auto my-16 px-4">
      <div className="p-8 rounded-2xl border border-[#172935] bg-[#0c161e] shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#0e261f] border border-[#175c44] flex items-center justify-center text-[#54f2a3] mb-3 shadow-sm">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Sign in to MEDVEIL</h2>
          <p className="text-xs text-slate-400 mt-1">Select a role or sign in with your credentials</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* 1-Click Role Switcher */}
        <div className="mb-6">
          <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-semibold">
            Instant Demo Logins (1-Click)
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => quickLogin('rahul')}
              className="p-3 text-left rounded-xl border border-[#172935] bg-[#081016] hover:border-[#175c44] hover:bg-[#0e261f]/30 text-xs transition group"
            >
              <div className="font-semibold text-white group-hover:text-[#54f2a3] transition-colors">Patient</div>
              <div className="text-[10px] text-slate-400">Rahul Sharma</div>
            </button>
            <button
              type="button"
              onClick={() => quickLogin('apollo_hospital')}
              className="p-3 text-left rounded-xl border border-[#172935] bg-[#081016] hover:border-[#175c44] hover:bg-[#0e261f]/30 text-xs transition group"
            >
              <div className="font-semibold text-white group-hover:text-[#54f2a3] transition-colors">Hospital</div>
              <div className="text-[10px] text-slate-400">Apollo Hospital</div>
            </button>
            <button
              type="button"
              onClick={() => quickLogin('medicare_insurer')}
              className="p-3 text-left rounded-xl border border-[#172935] bg-[#081016] hover:border-[#175c44] hover:bg-[#0e261f]/30 text-xs transition group"
            >
              <div className="font-semibold text-white group-hover:text-[#54f2a3] transition-colors">Insurer</div>
              <div className="text-[10px] text-slate-400">MediCare Provider</div>
            </button>
            <button
              type="button"
              onClick={() => quickLogin('dr_sharma')}
              className="p-3 text-left rounded-xl border border-[#172935] bg-[#081016] hover:border-[#175c44] hover:bg-[#0e261f]/30 text-xs transition group"
            >
              <div className="font-semibold text-white group-hover:text-[#54f2a3] transition-colors">Doctor</div>
              <div className="text-[10px] text-slate-400">Dr. A. K. Sharma</div>
            </button>
          </div>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#172935]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#0c161e] px-2 text-slate-500 font-mono text-[10px]">Or use credentials</span>
          </div>
        </div>

        {/* Traditional Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Username or Email</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. rahul"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-slate-200 text-sm focus:outline-none focus:border-[#54f2a3] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#081016] border border-[#172935] text-slate-200 text-sm focus:outline-none focus:border-[#54f2a3] transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#54f2a3] hover:bg-[#6ef5b4] disabled:bg-[#175c44] text-[#041c13] font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? 'Authenticating...' : 'Sign In'} <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Web3 Wallet Signature Challenge Login */}
        <div className="mt-5 pt-5 border-t border-[#172935]">
          <button
            type="button"
            onClick={handleWalletLogin}
            disabled={loading}
            className="w-full py-2.5 rounded-xl border border-[#172935] bg-[#081016] hover:border-[#175c44] hover:text-[#54f2a3] text-slate-300 text-xs font-mono transition flex items-center justify-center gap-2"
          >
            <Wallet className="w-4 h-4 text-[#54f2a3]" />
            <span>Sign In with Web3 Wallet Challenge</span>
          </button>
        </div>
      </div>
    </div>
  );
}
