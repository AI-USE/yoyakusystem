import { checkAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';
import { 
  Users, 
  Calendar, 
  UserX, 
  Bell, 
  Settings, 
  Clock, 
  ArrowRightLeft,
  ScanLine,
  ChevronRight
} from 'lucide-react';

export default async function DashboardPage() {
  const { staffId, role } = await checkAuth();

  // Basic stats (Optimized)
  const [{ count: slotCount }, { count: reservationCount }, { count: blacklistCount }] = await Promise.all([
    supabaseAdmin.from('slots').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('reservations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('blacklist').select('*', { count: 'exact', head: true })
  ]);

  const stats = [
    { label: '時間枠数', value: slotCount || 0, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '予約総数', value: reservationCount || 0, icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'ブラックリスト', value: blacklistCount || 0, icon: UserX, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const menuItems = [
    { label: '受付・入場', href: '/reception', icon: ScanLine, description: 'QRスキャン・名前登録', color: 'bg-indigo-600', roles: ['admin', 'staff'] },
    { label: '時間枠管理', href: '/slots', icon: Calendar, description: '枠作成・削除・ソート検索', color: 'bg-slate-700', roles: ['admin', 'staff'] },
    { label: '運行状況変更', href: '/operations', icon: ArrowRightLeft, description: '一括スライド・強制中止', color: 'bg-orange-500', roles: ['admin'] },
    { label: 'お知らせ配信', href: '/notifications', icon: Bell, description: '緊急通知の作成・配信', color: 'bg-pink-500', roles: ['admin'] },
    { label: 'ブラックリスト', href: '/blacklist', icon: UserX, description: '悪質ユーザーの管理', color: 'bg-red-600', roles: ['admin'] },
    { label: '全データ履歴', href: '/settings', icon: Settings, description: 'システム設定・操作履歴', color: 'bg-slate-500', roles: ['admin'] },
  ];

  return (
    <div className="p-8">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-slate-900">ダッシュボード</h1>
        <p className="text-slate-500 mt-2">お疲れ様です、<span className="font-bold text-slate-800">{staffId}</span> さん</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center">
            <div className={`${stat.bg} ${stat.color} p-4 rounded-xl mr-5`}>
              <stat.icon size={28} />
            </div>
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{stat.label}</p>
              <p className="text-3xl font-black text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
        <span className="w-1.5 h-6 bg-indigo-600 rounded-full mr-3"></span>
        管理メニュー
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {menuItems.filter(item => item.roles.includes(role)).map((item) => (
          <Link 
            key={item.href} 
            href={item.href}
            className="group bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border border-slate-100 relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 ${item.color} opacity-[0.03] -mr-8 -mt-8 rounded-full transition-all group-hover:scale-150`}></div>
            <div className="relative z-10">
              <div className={`${item.color} w-12 h-12 rounded-xl flex items-center justify-center text-white mb-6 shadow-lg`}>
                <item.icon size={24} />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">{item.label}</h3>
                <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-slate-400 text-sm mt-2 font-medium">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
