import Layout from '@/components/Layout';
import { checkAuth } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { staffId, role } = await checkAuth();
  return <Layout staffId={staffId} role={role}>{children}</Layout>;
}
