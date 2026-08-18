'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Send, Trash2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { createNotification, deleteNotification } from '@/actions/admin-actions';
import { getNotifications, getTodaySlots } from '@/actions/fetch-actions';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [targetSlotId, setTargetSlotId] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [notes, slotData] = await Promise.all([getNotifications(), getTodaySlots()]);
    setNotifications(notes);
    setSlots(slotData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createNotification(message, targetSlotId || null, isUrgent);
    if (res.success) {
        toast.success(res.message!);
        setMessage('');
        setIsUrgent(false);
        fetchData();
    } else {
        toast.error(res.message!);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteNotification(id);
    if (res.success) {
        toast.success(res.message!);
        fetchData();
    } else {
        toast.error(res.message!);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">お知らせ（緊急通知）配信</h1>
        <button onClick={fetchData} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm mb-8 border border-gray-100">
        <h2 className="text-lg font-bold mb-4 flex items-center">
          <Send className="mr-2" size={20} /> 新規メッセージ配信
        </h2>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">配信対象</label>
            <select 
              className="w-full border rounded-md px-3 py-2"
              value={targetSlotId}
              onChange={(e) => setTargetSlotId(e.target.value)}
            >
              <option value="">全員（全体通知）</option>
              {slots.map(slot => (
                <option key={slot.id} value={slot.id}>
                  {format(new Date(slot.start_time), 'HH:mm')} の回のみ
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
            <textarea 
              className="w-full border rounded-md px-3 py-2 h-24"
              placeholder="例: 会場周辺が混雑しているため、5分前までにお集まりください。"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            ></textarea>
          </div>
          <div className="flex items-center">
            <input 
              type="checkbox" 
              id="urgent" 
              className="mr-2"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
            />
            <label htmlFor="urgent" className="text-sm font-bold text-red-600">緊急フラグを立てる（目立つ色で表示）</label>
          </div>
          <button className="bg-indigo-600 text-white px-6 py-2 rounded-md font-bold hover:bg-indigo-700">
            配信を実行する
          </button>
        </form>
      </div>

      <h2 className="text-xl font-bold mb-4">配信済み履歴</h2>
      <div className="space-y-4">
        {notifications.map(note => (
          <div key={note.id} className={`bg-white p-4 rounded-lg shadow-sm border ${note.is_urgent ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center">
                <Bell size={16} className={`mr-2 ${note.is_urgent ? 'text-red-600' : 'text-gray-400'}`} />
                <span className="text-xs text-gray-500">{format(new Date(note.created_at), 'yyyy/MM/dd HH:mm')}</span>
                <span className="ml-3 px-2 py-0.5 rounded-full bg-gray-200 text-[10px] uppercase font-bold">
                  {note.slot_id ? `${format(new Date(note.slots.start_time), 'HH:mm')}枠` : '全体'}
                </span>
              </div>
              <button onClick={() => handleDelete(note.id)} className="text-gray-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
            <p className="text-sm">{note.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
