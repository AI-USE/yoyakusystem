'use client';

import Link from 'next/link';
import { Home, ScanLine, Calendar, ArrowRightLeft, Bell, UserX, Settings, LogOut, User, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'ホーム', href: '/', icon: Home, roles: ['admin', 'staff'] },
  { label: '受付・入場', href: '/reception', icon: ScanLine, roles: ['admin', 'staff'] },
  { label: '時間枠管理', href: '/slots', icon: Calendar, roles: ['admin', 'staff'] },
  { label: '運行状況', href: '/operations', icon: ArrowRightLeft, roles: ['admin'] },
  { label: 'お知らせ', href: '/notifications', icon: Bell, roles: ['admin'] },
  { label: 'BANリスト', href: '/blacklist', icon: UserX, roles: ['admin'] },
  { label: '全データ履歴', href: '/settings', icon: Settings, roles: ['admin'] },
];

export default function ClientLayout({ children, staffId, role }: { children: React.ReactNode, staffId: string, role: string }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-16 bg-white border-b border-slate-200 z-[60] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black italic text-xs">P</div>
            <h2 className="text-lg font-black tracking-tighter">Pinky Admin</h2>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-slate-600">
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar / Mobile Menu Overlay */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-8 hidden lg:block">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black italic">P</div>
            <h2 className="text-xl font-black tracking-tighter">Pinky Admin</h2>
          </div>
        </div>

        <div className="lg:hidden h-16"></div> {/* Spacer for mobile header */}
        
        <div className="px-8 mb-10 pt-8 lg:pt-0">
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 border border-slate-100">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-indigo-600">
                    <User size={20} />
                </div>
                <div className="overflow-hidden">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signed in as</p>
                    <p className="text-sm font-bold text-slate-700 truncate">{staffId}</p>
                </div>
            </div>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto">
          <div className="space-y-1">
            {navItems.filter(item => item.roles.includes(role)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-3.5 rounded-xl transition-all font-bold text-sm group ${
                    pathname === item.href ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50'
                }`}
              >
                <item.icon size={20} className={`mr-3 transition-transform ${pathname === item.href ? 'scale-110' : 'group-hover:scale-110'}`} />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="p-4 mt-auto border-t border-slate-100">
          <form action="/api/logout" method="POST">
            <button className="flex items-center px-4 py-4 w-full rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm">
              <LogOut size={20} className="mr-3" />
              ログアウト
            </button>
          </form>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isMenuOpen && (
        <div 
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40"
            onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-72 min-h-screen pt-16 lg:pt-0">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
