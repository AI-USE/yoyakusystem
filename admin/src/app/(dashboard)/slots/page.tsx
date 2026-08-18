'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Plus, Trash2, Search, ArrowUpDown, RefreshCw, Users as UsersIcon, X, UserX } from 'lucide-react';
import { createSlot, deleteSlot, updateReservationStatus, slideSlots, reassignReservation, toggleSlotCancel, addToBlacklist } from '@/actions/admin-actions';
import { getSlotsData, getReservationsBySlot } from '@/actions/fetch-actions';
import toast from 'react-hot-toast';

export default function SlotsPage() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [minAvailable, setMinAvailable] = useState('0');
  const [showFutureOnly, setShowFutureOnly] = useState(true);
  const [sortBy, setSortBy] = useState('start_time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Form states
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newCapacity, setNewCapacity] = useState('10');

  // Per-slot management
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [slotReservations, setSlotReservations] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [isReassigning, setIsReassigning] = useState<string | null>(null);

  // Slide management
  const [isSlideModalOpen, setIsSlideModalOpen] = useState(false);
  const [slideSlotId, setSlideSlotId] = useState('');
  const [slideMins, setSlideMins] = useState('15');
  const [slideMode, setSlideMode] = useState<'single' | 'cascade'>('cascade');

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
        const data = await getSlotsData();
        const sorted = [...data].sort((a, b) => {
            if (sortBy === 'start_time') {
                return sortOrder === 'asc' 
                    ? new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                    : new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
            }
            if (sortBy === 'capacity') {
                const ra = a.capacity - a.reserved_count;
                const rb = b.capacity - b.reserved_count;
                return sortOrder === 'asc' ? ra - rb : rb - ra;
            }
            return 0;
        });
        setSlots(sorted);
    } catch (err) {
        toast.error('データの取得に失敗しました');
    } finally {
        setLoading(false);
    }
  }, [sortBy, sortOrder]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const start = new Date(newStartTime);
    const end = new Date(newEndTime);
    const now = new Date();

    // Validations
    if (start < now) {
        toast.error('過去の時間は設定できません');
        return;
    }
    if (end <= start) {
        toast.error('終了時間は開始時間より後である必要があります');
        return;
    }
    if (start.toDateString() !== end.toDateString()) {
        toast.error('日付をまたぐ枠は作成できません');
        return;
    }

    const res = await createSlot({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      capacity: parseInt(newCapacity),
    });

    if (res.success) {
      toast.success(res.message!);
      setNewStartTime('');
      setNewEndTime('');
      fetchSlots();
    } else {
      toast.error(res.message!);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    if (!confirm('この枠を削除してもよろしいですか？')) return;
    const res = await deleteSlot(id);
    if (res.success) {
      toast.success(res.message!);
      fetchSlots();
    } else {
      toast.error(res.message!);
    }
  };

  const handleToggleCancel = async (slot: any) => {
    const action = slot.is_cancelled ? '再開' : '中止';
    if (!confirm(`この枠の運用を${action}しますか？`)) return;
    const res = await toggleSlotCancel(slot.id, slot.is_cancelled);
    if (res.success) {
        toast.success(res.message!);
        fetchSlots();
    } else {
        toast.error(res.message!);
    }
  };

  const handleReassign = async (resId: string, newSlotId: string) => {
    if (!newSlotId) return;
    const res = await reassignReservation(resId, newSlotId);
    if (res.success) {
        toast.success(res.message!);
        const data = await getReservationsBySlot(selectedSlot.id);
        setSlotReservations(data);
        setIsReassigning(null);
        fetchSlots();
    } else {
        toast.error(res.message!);
    }
  };

  const handleOpenReservations = async (slot: any) => {
    setSelectedSlot(slot);
    setModalLoading(true);
    const data = await getReservationsBySlot(slot.id);
    setSlotReservations(data);
    setModalLoading(false);
  };

  const handleUpdateStatus = async (resId: string, status: string) => {
    const res = await updateReservationStatus(resId, status);
    if (res.success) {
        toast.success(res.message!);
        const data = await getReservationsBySlot(selectedSlot.id);
        setSlotReservations(data);
        fetchSlots();
    } else {
        toast.error(res.message!);
    }
  };

  const handleCancelReservation = async (resId: string, name: string) => {
    if (!confirm(`${name} さんの予約を削除（取消）しますか？`)) return;
    await handleUpdateStatus(resId, 'cancelled');
  };

  const handleBanUser = async (lineId: string | null, resId: string, name: string) => {
    if (!lineId) {
        toast.error('LINE IDがないユーザーはBANできません。予約の削除のみ行ってください。');
        return;
    }
    if (!confirm(`${name} さんをブラックリストに登録し、予約を削除しますか？`)) return;
    
    const res = await addToBlacklist(lineId, '管理画面からの即時BAN');
    if (res.success) {
        await handleUpdateStatus(resId, 'cancelled');
    } else {
        toast.error(res.message!);
    }
  };

  const handleOpenSlide = (slotId: string) => {
    setSlideSlotId(slotId);
    setIsSlideModalOpen(true);
  };

  const executeSlide = async () => {
    const res = await slideSlots(parseInt(slideMins), slideMode, slideSlotId);
    if (res.success) {
      toast.success(res.message!);
      setIsSlideModalOpen(false);
      fetchSlots();
    } else {
      toast.error(res.message!);
    }
  };

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const filteredSlots = slots.filter(slot => {
    const matchesSearch = format(new Date(slot.start_time), 'HH:mm').includes(searchTerm);
    const hasMinSeats = (slot.capacity - slot.reserved_count) >= parseInt(minAvailable || '0');
    const isFuture = !showFutureOnly || new Date(slot.start_time) > new Date();
    return matchesSearch && hasMinSeats && isFuture;
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">時間枠管理</h1>

      {/* Create New Slot */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-8 border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Plus className="mr-2" size={20} /> 新規枠作成
        </h2>
        <form onSubmit={handleCreateSlot} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700">開始時間</label>
            <input
              type="datetime-local"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">終了時間</label>
            <input
              type="datetime-local"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">定員</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              value={newCapacity}
              onChange={(e) => setNewCapacity(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 h-[42px]"
          >
            追加する
          </button>
        </form>
      </div>

      {/* Search and Sort */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button onClick={fetchSlots} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="時間で検索 (例: 14:00)"
              className="pl-10 pr-4 py-2 border rounded-md w-full md:w-48 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-md">
            <span className="text-xs font-bold text-slate-400 whitespace-nowrap">空き枠数指定:</span>
            <input 
              type="number"
              min="0"
              className="w-12 text-sm font-bold outline-none"
              value={minAvailable}
              onChange={(e) => setMinAvailable(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowFutureOnly(!showFutureOnly)}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all border ${
                showFutureOnly ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            {showFutureOnly ? '未来の枠のみ' : 'すべての枠'}
          </button>
        </div>
      </div>

      {/* Slots Table / Mobile Cards */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
        {/* Desktop View */}
        <table className="min-w-full divide-y divide-gray-200 hidden md:table">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort('start_time')}
              >
                <div className="flex items-center">
                  日時 <ArrowUpDown size={14} className="ml-1" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">定員 / 予約数</th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort('capacity')}
              >
                <div className="flex items-center">
                  残り数 <ArrowUpDown size={14} className="ml-1" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状態</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center">読み込み中...</td></tr>
            ) : filteredSlots.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center">枠が見つかりません</td></tr>
            ) : filteredSlots.map((slot) => {
              const remaining = slot.capacity - slot.reserved_count;
              return (
                <tr key={slot.id} className={slot.is_cancelled ? 'bg-red-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {format(new Date(slot.start_time), 'M/d (E)', { locale: ja })}
                    </div>
                    <div className="text-sm text-gray-500">
                      {format(new Date(slot.start_time), 'HH:mm')} - {format(new Date(slot.end_time), 'HH:mm')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {slot.capacity} / {slot.reserved_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-semibold ${remaining <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {remaining} 席
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                        onClick={() => handleToggleCancel(slot)}
                        className={`px-2 py-1 text-xs font-semibold rounded-full transition-colors ${
                            slot.is_cancelled ? 'bg-red-100 text-red-800 hover:bg-red-200' : 'bg-green-100 text-green-800 hover:bg-green-200'
                        }`}
                    >
                        {slot.is_cancelled ? '中止中' : '運用中'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                    <button 
                      onClick={() => handleOpenReservations(slot)}
                      className="text-indigo-600 hover:text-indigo-900 inline-flex items-center"
                    >
                      <UsersIcon size={18} className="mr-1" /> 名簿
                    </button>
                    <button 
                      onClick={() => handleOpenSlide(slot.id)}
                      className="text-amber-600 hover:text-amber-900 inline-flex items-center"
                    >
                      <ArrowUpDown size={18} className="mr-1" /> スライド
                    </button>
                    <button 
                      onClick={() => handleDeleteSlot(slot.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-200">
          {loading ? (
            <div className="p-6 text-center">読み込み中...</div>
          ) : filteredSlots.length === 0 ? (
            <div className="p-6 text-center text-gray-500">枠が見つかりません</div>
          ) : filteredSlots.map((slot) => {
            const remaining = slot.capacity - slot.reserved_count;
            return (
              <div key={slot.id} className={`p-4 ${slot.is_cancelled ? 'bg-red-50' : 'bg-white'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">
                      {format(new Date(slot.start_time), 'M/d (E)', { locale: ja })}
                    </div>
                    <div className="text-lg font-black text-indigo-600">
                      {format(new Date(slot.start_time), 'HH:mm')} - {format(new Date(slot.end_time), 'HH:mm')}
                    </div>
                  </div>
                  <button 
                      onClick={() => handleToggleCancel(slot)}
                      className={`px-3 py-1 text-xs font-black rounded-full transition-colors ${
                          slot.is_cancelled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}
                  >
                      {slot.is_cancelled ? '中止中' : '運用中'}
                  </button>
                </div>
                
                <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-xl">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">予約状況</div>
                  <div className="text-sm font-black">
                    <span className="text-slate-400 mr-2">{slot.reserved_count} / {slot.capacity}</span>
                    <span className={remaining <= 0 ? 'text-red-600' : 'text-green-600'}>残 {remaining}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleOpenReservations(slot)}
                    className="flex-1 bg-white border border-slate-200 py-3 rounded-xl text-sm font-black text-slate-700 flex items-center justify-center shadow-sm"
                  >
                    <UsersIcon size={16} className="mr-2" /> 名簿
                  </button>
                  <button 
                    onClick={() => handleOpenSlide(slot.id)}
                    className="flex-1 bg-white border border-slate-200 py-3 rounded-xl text-sm font-black text-amber-600 flex items-center justify-center shadow-sm"
                  >
                    <ArrowUpDown size={16} className="mr-2" /> ｽﾗｲﾄﾞ
                  </button>
                  <button 
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="w-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center border border-red-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reservation List Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}></div>
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">
                            予約者名簿: {format(new Date(selectedSlot.start_time), 'HH:mm')}の回
                        </h3>
                        <p className="text-sm text-slate-400 font-medium">定員 {selectedSlot.capacity}名 / 予約 {selectedSlot.reserved_count}名</p>
                    </div>
                    <button onClick={() => setSelectedSlot(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    {modalLoading ? (
                        <div className="py-20 text-center text-slate-400 font-bold animate-pulse">読み込み中...</div>
                    ) : (
                        <table className="min-w-full">
                            <thead className="border-b border-slate-50">
                                <tr>
                                    <th className="text-left py-3 text-[10px] font-black uppercase text-slate-400">受付番号</th>
                                    <th className="text-left py-3 text-[10px] font-black uppercase text-slate-400">お名前</th>
                                    <th className="text-left py-3 text-[10px] font-black uppercase text-slate-400">ステータス</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-400">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {slotReservations.map(res => (
                                    <tr key={res.id} className="group">
                                        <td className="py-4 font-mono font-bold text-slate-400 text-sm">#{res.reception_number}</td>
                                        <td className="py-4 font-bold text-slate-700">{res.user_name || 'ゲスト'}</td>
                                        <td className="py-4">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                (res.status === 'checked_in' && new Date(selectedSlot.end_time) < new Date()) || res.status === 'finished' ? 'bg-slate-100 text-slate-400' :
                                                res.status === 'checked_in' ? 'bg-green-100 text-green-600' : 
                                                'bg-indigo-50 text-indigo-500'
                                            }`}>
                                                {(res.status === 'checked_in' && new Date(selectedSlot.end_time) < new Date()) || res.status === 'finished' ? '完了' : 
                                                 res.status === 'checked_in' ? '入場済' : '予約中'}
                                            </span>
                                        </td>
                                        <td className="py-4 text-right space-x-3">
                                            {res.status === 'checked_in' && (
                                                <button 
                                                    onClick={() => handleUpdateStatus(res.id, 'finished')}
                                                    className="text-green-600 hover:text-green-700 font-bold text-xs"
                                                >
                                                    完了にする
                                                </button>
                                            )}
                                            {isReassigning === res.id ? (
                                                <select 
                                                    className="text-xs border-slate-200 rounded p-1"
                                                    onChange={(e) => handleReassign(res.id, e.target.value)}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>移動先を選択</option>
                                                    {slots.filter(s => s.id !== selectedSlot.id && !s.is_cancelled).map(s => (
                                                        <option key={s.id} value={s.id}>
                                                            {format(new Date(s.start_time), 'HH:mm')} ({s.capacity - s.reserved_count}空き)
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <button 
                                                    onClick={() => setIsReassigning(res.id)}
                                                    className="text-indigo-400 hover:text-indigo-600 font-bold text-xs"
                                                >
                                                    移動
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleCancelReservation(res.id, res.user_name)}
                                                className="text-red-400 hover:text-red-600 font-bold text-xs"
                                            >
                                                取消
                                            </button>
                                            {res.line_user_id && (
                                                <button 
                                                    onClick={() => handleBanUser(res.line_user_id, res.id, res.user_name)}
                                                    className="text-red-600 hover:text-red-800 font-bold text-xs flex items-center gap-0.5"
                                                >
                                                    <UserX size={12} /> BAN
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {slotReservations.length === 0 && (
                                    <tr><td colSpan={4} className="py-20 text-center text-slate-300 font-bold italic">予約者はいません</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button 
                        onClick={() => setSelectedSlot(null)}
                        className="bg-white border border-slate-200 px-6 py-2 rounded-xl font-bold text-slate-600 hover:bg-white/80"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Slide Modal */}
      {isSlideModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSlideModalOpen(false)}></div>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-4">時間枠のスライド</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">スライド時間（分）</label>
                        <select 
                            value={slideMins} 
                            onChange={(e) => setSlideMins(e.target.value)}
                            className="w-full border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="5">5分</option>
                            <option value="10">10分</option>
                            <option value="15">15分</option>
                            <option value="30">30分</option>
                            <option value="60">60分</option>
                            <option value="-15">-15分（繰り上げ）</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">スライド対象</label>
                        <div className="flex space-x-4">
                            <label className="flex items-center">
                                <input 
                                    type="radio" 
                                    className="text-indigo-600" 
                                    checked={slideMode === 'single'} 
                                    onChange={() => setSlideMode('single')} 
                                />
                                <span className="ml-2 text-sm">この枠のみ</span>
                            </label>
                            <label className="flex items-center">
                                <input 
                                    type="radio" 
                                    className="text-indigo-600" 
                                    checked={slideMode === 'cascade'} 
                                    onChange={() => setSlideMode('cascade')} 
                                />
                                <span className="ml-2 text-sm">以降すべての枠</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex space-x-3">
                    <button 
                        onClick={() => setIsSlideModalOpen(false)}
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                    >
                        キャンセル
                    </button>
                    <button 
                        onClick={executeSlide}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
                    >
                        実行
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
