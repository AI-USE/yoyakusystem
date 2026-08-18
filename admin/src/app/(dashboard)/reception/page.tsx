'use client';

import { useState, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { Scan, UserPlus, CheckCircle, AlertCircle, XCircle, User, List, LogIn, RefreshCw, X, Check, Info, UserX } from 'lucide-react';
import { format } from 'date-fns';
import { finalizeReservation, checkInReservation, updateReservationStatus, addToBlacklist } from '@/actions/admin-actions';
import { getTodaySlots, getReservationsBySlot } from '@/actions/fetch-actions';
import toast from 'react-hot-toast';

export default function ReceptionPage() {
  const [mode, setMode] = useState<'reservation' | 'reception'>('reservation');
  const [isScanning, setIsScanning] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [slotReservations, setSlotReservations] = useState<any[]>([]);
  const [showManualList, setShowManualList] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Scanned Data
  const [parsedData, setParsedData] = useState<{
    type: 'RESERVE' | 'GENERAL' | 'TOKEN',
    slotId?: string,
    lineId?: string,
    userName?: string,
    token?: string
  } | null>(null);

  const [inputName, setInputName] = useState('');

  const fetchTodaySlots = useCallback(async () => {
    const data = await getTodaySlots();
    if (data && data.length > 0) {
      setSlots(data);
      if (!selectedSlotId) {
          // Default selection: Nearest upcoming one (end_time hasn't passed)
          const now = new Date();
          const nearest = data.find((s: any) => new Date(s.end_time) > now) || data[0];
          setSelectedSlotId(nearest.id);
      }
    }
  }, [selectedSlotId]);

  const fetchSlotReservations = useCallback(async () => {
    if (!selectedSlotId) return;
    setLoading(true);
    const data = await getReservationsBySlot(selectedSlotId);
    setSlotReservations(data || []);
    setLoading(false);
  }, [selectedSlotId]);

  useEffect(() => {
    fetchTodaySlots();
  }, [fetchTodaySlots]);

  useEffect(() => {
    if (mode === 'reception') {
        fetchSlotReservations();
    }
  }, [mode, selectedSlotId, fetchSlotReservations]);

  const startScanner = async () => {
    setIsScanning(true);
    setParsedData(null);
    const codeReader = new BrowserMultiFormatReader();
    try {
      const videoInputDevices = await codeReader.listVideoInputDevices();
      const firstDeviceId = videoInputDevices[0].deviceId;
      
      codeReader.decodeFromVideoDevice(firstDeviceId, 'video', async (result) => {
        if (result) {
          codeReader.reset();
          setIsScanning(false);
          handleScanResult(result.getText());
        }
      });
    } catch (err) {
      console.error(err);
      setIsScanning(false);
      toast.error('カメラの起動に失敗しました');
    }
  };

  const handleScanResult = (text: string) => {
    if (text.startsWith('RESERVE:')) {
      const parts = text.split(':');
      const scanSlotId = parts[1];
      setParsedData({ type: 'RESERVE', slotId: scanSlotId, lineId: parts[2], userName: parts[3] });
      setInputName(parts[3] || '');
      // Auto-switch to user's desired slot if it exists in today's slots
      if (scanSlotId) setSelectedSlotId(scanSlotId);
    } else if (text.startsWith('GENERAL:')) {
      const parts = text.split(':');
      setParsedData({ type: 'GENERAL', lineId: parts[1], userName: parts[2] });
      setInputName(parts[2] || '');
    } else {
      setParsedData({ type: 'TOKEN', token: text });
    }
  };

  const handleManualCheckIn = async (id: string, name: string) => {
    if (!confirm(`${name} さんを入場処理しますか？`)) return;
    setLoading(true);
    const res = await checkInReservation(id, selectedSlotId);
    if (res.success) {
        toast.success(res.message!);
        fetchSlotReservations();
    } else {
        toast.error(res.message!);
    }
    setLoading(false);
  };

  const handleBanUser = async (lineId: string | null, resId: string, name: string) => {
    if (!lineId) {
        toast.error('LINE IDがないユーザーはBANできません。予約の削除のみ行ってください。');
        return;
    }
    if (!confirm(`${name} さんをブラックリストに登録し、予約を削除しますか？`)) return;
    setLoading(true);
    const res = await addToBlacklist(lineId, '受付画面からの即時BAN');
    if (res.success) {
        await updateReservationStatus(resId, 'cancelled');
        fetchSlotReservations();
    } else {
        toast.error(res.message!);
    }
    setLoading(false);
  };

  const handleFinishExperience = async (id: string, name: string) => {
    if (!confirm(`${name} さんの体験を終了（完了）にしますか？`)) return;
    setLoading(true);
    const res = await updateReservationStatus(id, 'finished');
    if (res.success) {
        toast.success('体験を完了しました');
        fetchSlotReservations();
    } else {
        toast.error(res.message!);
    }
    setLoading(false);
  };

  const handleConfirmReservation = async (asCheckedIn: boolean) => {
    if (!parsedData || !selectedSlotId) return;
    if (!inputName.trim()) {
        toast.error('名前を入力してください');
        return;
    }
    setLoading(true);
    
    const res = await finalizeReservation(
        selectedSlotId, 
        inputName, 
        parsedData.lineId || null,
        asCheckedIn ? 'checked_in' : 'reserved'
    );

    if (res.success) {
        toast.success(res.message!);
        setParsedData(null);
        setInputName('');
        // Refresh everything to update capacity UI
        fetchTodaySlots();
        fetchSlotReservations();
    } else {
        toast.error(res.message!);
    }
    setLoading(false);
  };

  const handleCheckInToken = async () => {
    if (!parsedData?.token) return;
    setLoading(true);
    
    const res = await checkInReservation(parsedData.token, selectedSlotId);
    if (res.success) {
        toast.success(res.message!);
        setParsedData(null);
        fetchSlotReservations();
    } else {
        toast.error(res.message!);
    }
    setLoading(false);
  };

  const selectedSlot = slots.find(s => s.id === selectedSlotId);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Tab Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex">
          <button 
            onClick={() => { setMode('reservation'); setParsedData(null); setShowManualList(false); }}
            className={`flex-1 py-4 text-sm font-black transition-all ${mode === 'reservation' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-slate-400'}`}
          >
            予約受付 (新規)
          </button>
          <button 
            onClick={() => { setMode('reception'); setParsedData(null); }}
            className={`flex-1 py-4 text-sm font-black transition-all ${mode === 'reception' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-slate-400'}`}
          >
            入場スキャン (済)
          </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        
        {/* Reception Mode Setup */}
        <div className="bg-indigo-900 p-6 rounded-[24px] shadow-xl text-white mb-8 relative overflow-hidden">
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Active Mode</p>
                    {mode === 'reception' && (
                        <button onClick={fetchSlotReservations} className="p-1 hover:bg-white/10 rounded">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    )}
                </div>
                <h2 className="text-2xl font-black mb-4">
                    {mode === 'reservation' ? '新規予約受付' : '入場スキャン'}
                </h2>
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <p className="text-[10px] font-black uppercase text-indigo-200 mb-1">対象の時間枠</p>
                    <select 
                        className="w-full bg-transparent border-none p-0 font-bold text-lg text-white outline-none appearance-none"
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                    >
                        {slots
                            .filter(s => {
                                if (mode === 'reception') return true;
                                const tenMinsAgo = new Date(Date.now() - 10 * 60000);
                                const isFuture = new Date(s.start_time) > tenMinsAgo;
                                const hasSpace = (s.capacity - (s.reserved_count || 0)) > 0;
                                return isFuture && hasSpace;
                            })
                            .map(s => (
                                <option key={s.id} value={s.id} className="text-slate-900">
                                    {format(new Date(s.start_time), 'HH:mm')}の回 (残{s.capacity - (s.reserved_count || 0)})
                                </option>
                            ))
                        }
                        {slots.length === 0 && <option value="">有効な枠がありません</option>}
                    </select>
                </div>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12">
                <Scan size={200} />
            </div>
        </div>

        {/* Manual List for Reception Mode */}
        {mode === 'reception' && !parsedData && (
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4 px-2">
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center">
                        <List size={16} className="mr-2" /> 予約者名簿
                    </h2>
                    <button 
                        onClick={() => setShowManualList(!showManualList)}
                        className="text-xs font-bold text-indigo-600 underline"
                    >
                        {showManualList ? '閉じる' : '名簿を表示'}
                    </button>
                </div>
                
                {showManualList && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                        {slotReservations.map(res => (
                            <div key={res.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                <div>
                                    <p className="font-bold text-slate-800">{res.user_name || 'ゲスト'}</p>
                                    <p className="text-[10px] text-slate-400">番号 #{res.reception_number}</p>
                                </div>
                                {res.status === 'reserved' && (
                                    <button 
                                        onClick={() => handleManualCheckIn(res.id, res.user_name)}
                                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-md active:scale-95"
                                    >
                                        入場
                                    </button>
                                )}
                                {(res.status === 'checked_in' && selectedSlot && new Date(selectedSlot.end_time) < new Date()) || res.status === 'finished' ? (
                                    <span className="text-[10px] font-black text-slate-300 uppercase bg-slate-50 px-2 py-1 rounded-md border border-slate-100">完了</span>
                                ) : res.status === 'checked_in' ? (
                                    <button 
                                        onClick={() => handleFinishExperience(res.id, res.user_name)}
                                        className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg font-bold text-xs active:scale-95 transition-all"
                                    >
                                        完了にする
                                    </button>
                                ) : null}
                                {res.line_user_id && res.status !== 'cancelled' && (
                                    <button 
                                        onClick={() => handleBanUser(res.line_user_id, res.id, res.user_name)}
                                        className="text-red-400 hover:text-red-600 p-2"
                                    >
                                        <UserX size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {slotReservations.length === 0 && (
                            <p className="p-8 text-center text-gray-400 text-sm font-bold italic">予約者はまだいません</p>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* Scanner Area */}
        {!parsedData && (
            <div className="flex flex-col items-center">
                <div className="w-full aspect-square bg-slate-900 rounded-[40px] overflow-hidden relative shadow-2xl mb-8 border-8 border-white">
                    {isScanning ? (
                        <video id="video" className="w-full h-full object-cover"></video>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40">
                            <Scan size={80} strokeWidth={1} className="mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Scanner Ready</p>
                        </div>
                    )}
                    {isScanning && <div className="absolute inset-x-0 top-1/2 h-0.5 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-scan-line"></div>}
                </div>
                
                {!isScanning ? (
                    <button 
                        onClick={startScanner}
                        className="bg-indigo-600 text-white w-full py-6 rounded-[24px] text-xl font-black shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center"
                    >
                        <Scan className="mr-3" /> スキャン開始
                    </button>
                ) : (
                    <button 
                        onClick={() => { setIsScanning(false); window.location.reload(); }}
                        className="text-slate-400 font-bold py-2 flex items-center"
                    >
                        <X size={16} className="mr-1" /> スキャンを中止
                    </button>
                )}
            </div>
        )}

        {/* Result UI */}
        {parsedData && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white rounded-[32px] p-8 shadow-2xl border border-slate-100 mb-6">
                    <div className="flex justify-between items-start mb-6">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                            {parsedData.type === 'RESERVE' ? '枠指定あり予約' : parsedData.type === 'GENERAL' ? '自由相談QR' : '入場チケット'}
                        </span>
                        <button onClick={() => setParsedData(null)} className="p-1 text-slate-300 hover:text-slate-600">
                            <XCircle size={24} />
                        </button>
                    </div>

                    {/* Mode: Reservation (Handling Request QR or General QR) */}
                    {mode === 'reservation' && (parsedData.type === 'RESERVE' || parsedData.type === 'GENERAL') && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">お名前を確認・入力</label>
                                <div className="relative">
                                    <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                                    <input 
                                        type="text"
                                        placeholder="なまえを入力"
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 font-black text-lg text-slate-700 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                                        value={inputName}
                                        onChange={(e) => setInputName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {parsedData.slotId && parsedData.slotId !== selectedSlotId && (
                                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start">
                                    <AlertCircle className="text-amber-500 mr-3 shrink-0" size={20} />
                                    <p className="text-xs font-bold text-amber-700">
                                        ユーザーは他の枠を希望していますが、現在の「{selectedSlot?.start_time ? format(new Date(selectedSlot.start_time), 'HH:mm') : ''}の回」で登録します。
                                    </p>
                                </div>
                            )}

                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">確定する枠を選択</label>
                                <select 
                                    className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-700 outline-none ring-2 ring-indigo-500"
                                    value={selectedSlotId}
                                    onChange={(e) => setSelectedSlotId(e.target.value)}
                                >
                                    {slots
                                        .filter(s => {
                                            const tenMinsAgo = new Date(Date.now() - 10 * 60000);
                                            const isFuture = new Date(s.start_time) > tenMinsAgo;
                                            const hasSpace = (s.capacity - (s.reserved_count || 0)) > 0;
                                            return isFuture && hasSpace;
                                        })
                                        .map(s => (
                                            <option key={s.id} value={s.id}>
                                                {format(new Date(s.start_time), 'HH:mm')} の回
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="grid grid-cols-1 gap-3 pt-4 border-t border-slate-50">
                                <button 
                                    disabled={loading}
                                    onClick={() => handleConfirmReservation(true)}
                                    className="bg-indigo-600 text-white py-6 rounded-2xl font-black text-lg shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center"
                                >
                                    <Check className="mr-2" /> 確定して即入場
                                </button>
                                <button 
                                    disabled={loading}
                                    onClick={() => handleConfirmReservation(false)}
                                    className="bg-white text-indigo-600 border-2 border-indigo-100 py-4 rounded-2xl font-bold active:scale-95 disabled:opacity-50"
                                >
                                    予約のみ登録
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Mode: Reception (Handling Token QR) */}
                    {mode === 'reception' && parsedData.type === 'TOKEN' && (
                        <div className="space-y-6">
                            <div className="p-8 bg-green-50 rounded-[24px] border-2 border-dashed border-green-200 text-center">
                                <CheckCircle size={56} className="mx-auto text-green-500 mb-3" />
                                <p className="text-lg font-black text-green-700">有効な整理券です</p>
                                <p className="text-[10px] font-bold text-green-600/50 uppercase mt-1">Ready for check-in</p>
                            </div>
                            <button 
                                disabled={loading}
                                onClick={handleCheckInToken}
                                className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black text-xl shadow-xl active:scale-95 disabled:opacity-50"
                            >
                                入場を許可
                            </button>
                        </div>
                    )}

                    {/* Validation Errors */}
                    {mode === 'reception' && parsedData.type !== 'TOKEN' && (
                        <div className="p-8 bg-red-50 rounded-[24px] border border-red-100 text-center">
                            <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
                            <p className="text-lg font-black text-red-600">未確定の予約です</p>
                            <p className="text-sm font-medium text-red-500 mt-2">
                                まず「予約受付」モードで確定させてください
                            </p>
                            <button 
                                onClick={() => { setMode('reservation'); }}
                                className="mt-6 bg-red-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md"
                            >
                                モードを切り替える
                            </button>
                        </div>
                    )}

                    {mode === 'reservation' && parsedData.type === 'TOKEN' && (
                        <div className="p-8 bg-amber-50 rounded-[24px] border border-amber-100 text-center">
                            <Info className="mx-auto text-amber-500 mb-4" size={48} />
                            <p className="text-lg font-black text-amber-700">既に入場券をお持ちです</p>
                            <p className="text-sm font-medium text-amber-600 mt-2">
                                「入場スキャン」モードで読み取ってください
                            </p>
                            <button 
                                onClick={() => { setMode('reception'); }}
                                className="mt-6 bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md"
                            >
                                スキャンモードへ
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Manual Walk-in */}
        {!parsedData && (
            <div className="mt-12 text-center pb-10">
                <button 
                    onClick={() => {
                        setParsedData({ type: 'GENERAL', userName: '' });
                        setInputName('');
                    }}
                    className="inline-flex items-center text-slate-400 font-bold text-sm bg-white px-6 py-3 rounded-full border border-slate-200 shadow-sm active:bg-slate-50 transition-colors"
                >
                    <UserPlus size={18} className="mr-2" /> 飛び込み客（手動入力）
                </button>
            </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes scan-line {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
