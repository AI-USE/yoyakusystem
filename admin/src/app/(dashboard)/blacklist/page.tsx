'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserX, Trash2, ShieldAlert, RefreshCw } from 'lucide-react';
import { addToBlacklist, removeFromBlacklist } from '@/actions/admin-actions';
import { getBlacklist } from '@/actions/fetch-actions';
import toast from 'react-hot-toast';

export default function BlacklistPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lineUserId, setLineUserId] = useState('');
  const [reason, setReason] = useState('');

  const fetchBlacklist = useCallback(async () => {
    setLoading(true);
    const data = await getBlacklist();
    if (data) setList(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBlacklist();
  }, [fetchBlacklist]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await addToBlacklist(lineUserId, reason);
    if (res.success) {
        toast.success(res.message!);
        setLineUserId('');
        setReason('');
        fetchBlacklist();
    } else {
        toast.error(res.message!);
    }
  };

  const handleRemove = async (id: string) => {
    const res = await removeFromBlacklist(id);
    if (res.success) {
        toast.success(res.message!);
        fetchBlacklist();
    } else {
        toast.error(res.message!);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <ShieldAlert className="mr-2 text-red-600" /> ブラックリスト管理
        </h1>
        <button onClick={fetchBlacklist} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm mb-8 border border-red-100">
        <h2 className="text-lg font-bold mb-4">新規ブラックリスト登録</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700">LINE User ID</label>
            <input 
              type="text" 
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Uxxxxxxx..."
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">理由</label>
            <input 
              type="text" 
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="ドタキャン、不正アクセス等"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <button className="bg-red-600 text-white px-4 py-2 rounded-md font-bold hover:bg-red-700">
            登録する
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">LINE ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">理由</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">登録日</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {list.map((item) => (
              <tr key={item.line_user_id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{item.line_user_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.reason}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(item.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleRemove(item.line_user_id)} className="text-red-600 hover:text-red-900">
                    解除
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">対象者はいません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
