import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function checkAuth() {
  const cookieStore = await cookies();
  const auth = cookieStore.get('admin_auth');
  const staffId = cookieStore.get('staff_id');
  const role = cookieStore.get('user_role');

  const isAdmin = auth?.value === process.env.ADMIN_PASSWORD;
  const isStaff = auth?.value === process.env.STAFF_PASSWORD;

  if ((!isAdmin && !isStaff) || !staffId?.value) {
    redirect('/login');
  }
  
  return { staffId: staffId.value, role: role?.value || 'staff' };
}
