'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldCheck, Activity, LogOut, Wallet } from 'lucide-react';
import { getStoredUser, removeToken } from '../lib/api';
import { connectWallet, formatAddress } from '../lib/web3';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);

    // Auto-sync connected wallet address on mount
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum
        .request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts && accounts[0]) {
            setWalletAddress(accounts[0]);
          }
        })
        .catch(() => {});

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts && accounts[0]) {
          setWalletAddress(accounts[0]);
        } else {
          setWalletAddress('');
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        if (window.ethereum?.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, [pathname]);

  const handleLogout = () => {
    removeToken();
    setUser(null);
    router.push('/login');
  };

  const handleConnectWallet = async () => {
    try {
      const { address } = await connectWallet();
      setWalletAddress(address);
    } catch (err: any) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('rejected'))) {
        return;
      }
      alert(err.message);
    }
  };

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'PATIENT':
        return '/patient';
      case 'HOSPITAL':
        return '/hospital';
      case 'INSURER':
        return '/insurer';
      case 'DOCTOR':
        return '/doctor';
      case 'ADMIN':
        return '/admin';
      default:
        return '/login';
    }
  };

  return (
    <nav className="border-b border-[#152532] bg-[#070d12]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="p-2 rounded-lg bg-[#0e261f] border border-[#175c44] text-[#54f2a3] group-hover:border-[#54f2a3] transition">
            <ShieldCheck className="w-5 h-5 text-[#54f2a3]" />
          </div>
          <div>
            <div className="font-bold text-lg tracking-wider text-white flex items-center gap-1.5">
              MED<span className="text-[#54f2a3]">VEIL</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0e261f] border border-[#175c44] text-[#54f2a3] font-mono">
                ZK-MVP
              </span>
            </div>
            <div className="text-[10px] text-slate-400 tracking-tight">Private Healthcare. Verifiable Claims.</div>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <Link href="/patient" className={`hover:text-[#54f2a3] transition ${pathname === '/patient' ? 'text-[#54f2a3] font-semibold' : ''}`}>
            Patient
          </Link>
          <Link href="/doctor" className={`hover:text-[#54f2a3] transition ${pathname === '/doctor' ? 'text-[#54f2a3] font-semibold' : ''}`}>
            Doctor
          </Link>
          <Link href="/hospital" className={`hover:text-[#54f2a3] transition ${pathname === '/hospital' ? 'text-[#54f2a3] font-semibold' : ''}`}>
            Hospital
          </Link>
          <Link href="/insurer" className={`hover:text-[#54f2a3] transition ${pathname === '/insurer' ? 'text-[#54f2a3] font-semibold' : ''}`}>
            Insurer
          </Link>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Wallet connect pill */}
          <button
            onClick={handleConnectWallet}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#172935] bg-[#0c161e] text-xs font-mono text-slate-300 hover:border-[#175c44] hover:text-[#54f2a3] transition"
          >
            <Wallet className="w-3.5 h-3.5 text-[#54f2a3]" />
            <span>{walletAddress ? formatAddress(walletAddress) : 'Connect Wallet'}</span>
          </button>

          {/* User Auth state */}
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href={getDashboardPath()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e261f] border border-[#175c44] text-[#54f2a3] text-xs font-medium hover:bg-[#14362c] transition"
              >
                <Activity className="w-3.5 h-3.5" />
                <span className="uppercase">{user.role} Portal</span>
              </Link>
              <button
                onClick={handleLogout}
                title="Log out"
                className="p-1.5 rounded-lg border border-[#152532] text-slate-400 hover:text-red-400 hover:border-red-900 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"
              >
                Sign In
              </Link>
              <Link
                href="/login"
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#54f2a3] hover:bg-[#6ef5b4] text-[#041c13] transition shadow-sm shadow-[#54f2a3]/20"
              >
                Launch Demo
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
