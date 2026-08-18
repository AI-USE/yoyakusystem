import { cookies } from 'next/headers';
import ClientLayout from '@/components/ClientLayout';

export default async function Layout({ children, staffId, role }: { children: React.ReactNode, staffId: string, role: string }) {
  return <ClientLayout staffId={staffId} role={role}>{children}</ClientLayout>;
}
