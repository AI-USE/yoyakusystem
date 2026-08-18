'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, ArrowRight, AlertTriangle, XCircle, Users, CheckCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { slideSlots, toggleSlotCancel as cancelSlotAction } from '@/actions/admin-actions';
import { getSlotsData } from '@/actions/fetch-actions';
import toast from 'react-hot-toast';

export default function OperationsPage() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideMinutes, setSlideMinutes] = useState('15');

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
        const data = await getSlotsData();
        setSlots(data);
    } catch (err) {
        toast.error('データの取得に失敗しました');
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const handleSlideAll = async () => {
    const mins = parseInt(slideMinutes);
    if (isNaN(mins)) return;
    if (!confirm(`${mins}分、これ以降のすべての枠をスライド（遅延）させますか？`)) return;

    const res = await slideSlots(mins);
    if (res.success) {
        toast.success(res.message!);
        fetchSlots();
    } else {
        toast.error(res.message!);
    }
  };

  const toggleSlotCancel = async (slotId: string, currentStatus: boolean) => {
    const action = currentStatus ? '再開' : '中止';
    if (!confirm(`この枠を${action}しますか？${!currentStatus ? '新規予約が停止されます。' : ''}`)) return;

    const res = await cancelSlotAction(slotId, currentStatus);
    if (res.success) {
        toast.success(res.message!);
        fetchSlots();
    } else {
        toast.error(res.message!);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-red-600 flex items-center">
            <AlertTriangle className="mr-2" /> 運行状況変更・コントロール
        </h1>
        <button onClick={fetchSlots} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Slide Functionality */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-10 border-l-4 border-yellow-500">
        <h2 className="text-lg font-bold mb-4 flex items-center">
          <Clock className="mr-2" /> 一括スライド（遅延対応）
        </h2>
        <p className="text-gray-600 mb-6 text-sm">
          トラブルや公演の押しにより、以降のスケジュールをすべて一括で遅らせる場合にのみ使用してください。<br />
          ボタンを押すと、<strong>現在時刻より後のすべての枠</strong>の開始・終了時間が指定分だけ後ろ倒しになります。
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <input 
              type="number" 
              className="w-20 px-3 py-2 border rounded-l-md text-center font-bold"
              value={slideMinutes}
              onChange={(e) => setSlideMinutes(e.target.value)}
            />
            <span className="bg-gray-100 px-4 py-2 border border-l-0 rounded-r-md">分 遅らせる</span>
          </div>
          <ArrowRight className="text-gray-400" />
          <button 
            onClick={handleSlideAll}
            className="bg-yellow-500 text-white px-6 py-2 rounded-md font-bold hover:bg-yellow-600 transition-colors"
          >
            一括スライド実行
          </button>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">枠の中止・個別管理</h2>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        {/* Desktop View */}
        <table className="min-w-full divide-y divide-gray-200 hidden md:table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">時間枠</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">予約者数</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
               <tr><td colSpan={4} className="px-6 py-4 text-center">読み込み中...</td></tr>
            ) : slots.map((slot) => (
              <tr key={slot.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">
                    {format(new Date(slot.start_time), 'HH:mm')} 〜 {format(new Date(slot.end_time), 'HH:mm')}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-gray-600">
                    <Users size={16} className="mr-1" /> {slot.reserved_count} 名
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {slot.is_cancelled ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <XCircle size={12} className="mr-1" /> 配信停止（中止）
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <CheckCircle size={12} className="mr-1" /> 正常稼働中
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => toggleSlotCancel(slot.id, slot.is_cancelled)}
                    className={`px-4 py-1 rounded border ${
                      slot.is_cancelled 
                        ? 'border-green-500 text-green-600 hover:bg-green-50' 
                        : 'border-red-500 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {slot.is_cancelled ? '運用を再開する' : 'この枠を中止する'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
                <div className="p-10 text-center text-slate-400">読み込み中...</div>
            ) : slots.map((slot) => (
                <div key={slot.id} className="p-4 flex justify-between items-center bg-white">
                    <div>
                        <p className="text-lg font-black text-slate-800">
                            {format(new Date(slot.start_time), 'HH:mm')} 〜
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-slate-400 flex items-center">
                                <Users size={12} className="mr-1" /> {slot.reserved_count}名
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                slot.is_cancelled ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                            }`}>
                                {slot.is_cancelled ? '中止' : '稼働'}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={() => toggleSlotCancel(slot.id, slot.is_cancelled)}
                        className={`px-4 py-3 rounded-xl text-xs font-black shadow-sm border transition-all active:scale-95 ${
                            slot.is_cancelled 
                                ? 'bg-green-600 text-white border-green-600' 
                                : 'bg-white text-red-600 border-red-100'
                        }`}
                    >
                        {slot.is_cancelled ? '運用再開' : '枠を中止'}
                    </button>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
