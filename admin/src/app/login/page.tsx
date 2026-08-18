'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User } from 'lucide-react';

export default function LoginPage() {
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('スタッフIDまたはパスワードが正しくありません');
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 p-8 text-center">
            <h1 className="text-2xl font-bold text-white">運営管理システム</h1>
            <p className="text-indigo-100 text-sm mt-2">ログインして操作を開始してください</p>
        </div>
        <form onSubmit={handleSubmit} className="p-8">
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">スタッフID</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Staff ID"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">パスワード</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          {error && <p className="mb-6 text-sm text-red-600 bg-red-50 p-3 rounded-lg flex items-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? '認証中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
