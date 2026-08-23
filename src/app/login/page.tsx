// src/app/login/page.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const role = data.user?.app_metadata?.live_retail_claims?.role;
      if (role === 'floor_staff') {
        router.push('/floor');
      } else {
        router.push('/manager');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) { setError('Enter your email first'); return; }
    setLoading(true);
    const { error: magicError } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (magicError) setError(magicError.message);
    else setMagicLinkSent(true);
  };

  const handleDemoLogin = () => {
    // Dev mode: bypass auth and navigate as store manager
    router.push('/manager');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Branding */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-xl shadow-xl mx-auto mb-4">
            SS
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">SmartStock LiveRetail</h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise Inventory Intelligence</p>
        </div>

        {magicLinkSent ? (
          <div className="bg-emerald-900/40 border border-emerald-700 rounded-2xl p-6 text-center">
            <p className="text-emerald-300 font-bold">✉️ Magic link sent!</p>
            <p className="text-emerald-400 text-sm mt-1">Check your email and click the link to log in.</p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@store.com"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="bg-rose-900/40 border border-rose-700 rounded-xl p-3 text-rose-300 text-xs font-semibold">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="flex items-center gap-3 text-slate-600 text-xs">
              <div className="flex-1 h-px bg-slate-800" />
              <span>or</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-all"
            >
              ✉️ Send Magic Link
            </button>
          </form>
        )}

        {/* Dev demo bypass */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="border-t border-slate-800 pt-4 space-y-2">
            <p className="text-xs text-slate-500 text-center font-mono uppercase tracking-wider">Dev Mode Bypass</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => router.push('/floor')}
                className="py-2.5 bg-blue-900/40 border border-blue-800 text-blue-300 text-xs font-bold rounded-xl hover:bg-blue-800/40"
              >
                📱 Floor Staff
              </button>
              <button
                onClick={handleDemoLogin}
                className="py-2.5 bg-slate-800/60 border border-slate-700 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700/60"
              >
                👔 Manager
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-600">
          Secured by Supabase Auth · All data encrypted at rest
        </p>
      </div>
    </div>
  );
}
