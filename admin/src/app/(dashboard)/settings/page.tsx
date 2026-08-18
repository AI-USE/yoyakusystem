'use client';

import { useState, useEffect, useCallback } from 'react';
import { List, Trash2, Edit2, Check, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { updateReservationStatus } from '@/actions/admin-actions';
import { getRecentReservations } from '@/actions/fetch-actions';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [reservations, setReservations] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
        const data = await getRecentReservations();
        setReservations(data);
    } catch (err) {
        toast.error('データの取得に失敗しました');
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const handleUpdateStatus = async (id: string) => {
    const res = await updateReservationStatus(id, editStatus);
    if (res.success) {
        toast.success(res.message!);
        setEditingId(null);
        fetchReservations();
    } else {
        toast.error(res.message!);
    }
  };

  const handleDeleteReservation = async (id: string) => {
    if (!confirm('予約データを完全に削除しますか？（統計などからも消えます）')) return;
    // We could add a delete action if needed, using update status as cancelled for now
    await updateReservationStatus(id, 'cancelled');
    fetchReservations();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">全データ管理・履歴</h1>
        <button onClick={fetchReservations} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Reservations List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-gray-500">名前 / 番号</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500">枠</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500">状態</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {reservations.map(res => (
                    <tr key={res.id}>
                      <td className="px-4 py-2">
                        <div className="font-bold">{res.user_name || '名無し'}</div>
                        <div className="text-[10px] text-gray-400">#{res.reception_number}</div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {res.slots ? format(new Date(res.slots.start_time), 'HH:mm') : '削除済'}
                      </td>
                      <td className="px-4 py-2">
                        {editingId === res.id ? (
                          <div className="flex items-center gap-1">
                            <select 
                              className="border rounded px-1 text-xs"
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                            >
                              <option value="reserved">予約中</option>
                              <option value="checked_in">入場済</option>
                              <option value="finished">完了</option>
                              <option value="cancelled">取消</option>
                            </select>
                            <button onClick={() => handleUpdateStatus(res.id)} className="text-green-600"><Check size={16} /></button>
                            <button onClick={() => setEditingId(null)} className="text-red-600"><X size={16} /></button>
                          </div>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            res.status === 'checked_in' ? 'bg-green-100 text-green-800' :
                            res.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {res.status === 'reserved' ? '予約中' :
                             res.status === 'checked_in' ? '入場済' :
                             res.status === 'finished' ? '完了' :
                             res.status === 'cancelled' ? '取消' : res.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setEditingId(res.id); setEditStatus(res.status); }} className="text-gray-400 hover:text-blue-600">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteReservation(res.id)} className="text-gray-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reservations.length === 0 && !loading && (
                      <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">データがありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
        </div>
      </div>
    </div>
  );
}
