// src/app/login/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Mail, KeyRound, User, UserPlus, Shield, CheckCircle2, Building, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('store_manager');
  const [assignedStore, setAssignedStore] = useState('1001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [view, setView] = useState<'signin' | 'signup' | 'magic' | 'forgot'>('signin');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const role = data.user?.user_metadata?.role || data.user?.app_metadata?.live_retail_claims?.role;
      if (role === 'floor_staff' || role === 'floor_worker') {
        router.push('/floor');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || email.split('@')[0],
            role: selectedRole,
            store_id: assignedStore,
          },
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        setSuccessMsg('🎉 Account created and authenticated successfully! Redirecting...');
        setTimeout(() => {
          if (selectedRole === 'floor_staff' || selectedRole === 'floor_worker') {
            router.push('/floor');
          } else {
            router.push('/dashboard');
          }
        }, 1200);
      } else {
        setSuccessMsg('🎉 Account registered! Check your email to confirm your account or sign in directly.');
        setView('signin');
      }
    } catch (err: any) {
      setError(err.message || 'Account registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Enter your email first'); return; }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined,
        },
      });
      if (magicError) throw magicError;
      setSuccessMsg('✉️ Magic sign-in link sent! Check your inbox to log in immediately.');
    } catch (err: any) {
      setError(err.message || 'Could not send magic link.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Please enter your account email'); return; }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
      });
      if (resetError) throw resetError;
      setSuccessMsg('🔒 Password reset instructions sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Could not initiate password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white flex flex-col justify-between p-4 sm:p-6 selection:bg-[#14706B]">
      {/* Top bar back link */}
      <div className="max-w-md mx-auto w-full flex justify-between items-center py-2">
        <Link href="/" className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Landing Page</span>
        </Link>
        <span className="text-[11px] font-mono text-emerald-400">● Cloud Connected</span>
      </div>

      <div className="w-full max-w-sm mx-auto space-y-5 my-auto py-4">
        {/* Branding */}
        <div className="text-center">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#14706B] via-[#0E5652] to-emerald-500 flex items-center justify-center text-white font-extrabold text-xl shadow-xl shadow-emerald-950/50 mx-auto mb-3 border border-emerald-400/30">
            SS
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">SmartStock LiveRetail</h1>
          <p className="text-slate-400 text-xs mt-1">Enterprise Inventory Intelligence & POS Hub</p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-[11px]">
          <button
            onClick={() => { setView('signin'); setError(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              view === 'signin' ? 'bg-[#14706B] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setView('signup'); setError(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              view === 'signup' ? 'bg-[#14706B] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
          <button
            onClick={() => { setView('magic'); setError(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              view === 'magic' ? 'bg-[#14706B] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Magic Link
          </button>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-800 rounded-xl p-3.5 text-rose-300 text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-950/60 border border-emerald-700 rounded-xl p-3.5 text-emerald-300 text-xs font-semibold">
            {successMsg}
          </div>
        )}

        {/* ── PASSWORD SIGN IN FORM ── */}
        {view === 'signin' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="bkarthic98@gmail.com"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#14706B] to-emerald-600 hover:from-[#0E5652] hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setView('signup'); setError(null); setSuccessMsg(null); }}
                className="text-xs text-slate-400 hover:text-emerald-400"
              >
                Don't have an account? <strong className="text-emerald-400">Create Account</strong>
              </button>
            </div>
          </form>
        )}

        {/* ── CREATE ACCOUNT FORM ── */}
        {view === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                placeholder="Karthic B"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@retailco.com"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Password (6+ characters)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Role Assignment</label>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="store_manager">Store Manager</option>
                  <option value="floor_staff">Floor Staff</option>
                  <option value="regional_manager">Regional Manager</option>
                  <option value="supply_chain">Supply Chain</option>
                  <option value="integration_admin">Integration Admin</option>
                  <option value="system_admin">System Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Assigned Store</label>
                <select
                  value={assignedStore}
                  onChange={e => setAssignedStore(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="1001">1001 (Amsterdam)</option>
                  <option value="1002">1002 (Rotterdam)</option>
                  <option value="1004">1004 (Utrecht)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#14706B] to-emerald-600 hover:from-[#0E5652] hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Creating account...' : 'Create New Account'}</span>
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setView('signin'); setError(null); setSuccessMsg(null); }}
                className="text-xs text-slate-400 hover:text-emerald-400"
              >
                Already have an account? <strong className="text-emerald-400">Sign In</strong>
              </button>
            </div>
          </form>
        )}

        {/* ── MAGIC LINK FORM ── */}
        {view === 'magic' && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="bkarthic98@gmail.com"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              <span>{loading ? 'Sending link...' : 'Send Magic Sign-In Link'}</span>
            </button>
          </form>
        )}

        {/* ── FORGOT PASSWORD FORM ── */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Account Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="bkarthic98@gmail.com"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                We will email you a secure link to reset your password.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Sending...' : 'Send Reset Link'}</span>
            </button>
          </form>
        )}

        {/* Direct Access Section */}
        <div className="border-t border-slate-800/80 pt-4 space-y-2.5">
          <p className="text-[11px] text-slate-500 text-center font-mono uppercase tracking-wider">Direct Role Portals</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Link
              href="/dashboard"
              className="py-2.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 text-xs font-bold rounded-xl transition-all"
            >
              📊 Radar
            </Link>
            <Link
              href="/floor"
              className="py-2.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-teal-300 text-xs font-bold rounded-xl transition-all"
            >
              📱 Floor PWA
            </Link>
            <Link
              href="/admin"
              className="py-2.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold rounded-xl transition-all"
            >
              ⚙️ Admin
            </Link>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-600 py-2">
        Secured by Supabase Auth · SAP S/4HANA OData Certified Architecture
      </div>
    </div>
  );
}
