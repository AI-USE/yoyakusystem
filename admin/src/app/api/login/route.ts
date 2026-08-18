import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { staffId, password } = await request.json();

  let role: 'admin' | 'staff' | null = null;
  if (password === process.env.ADMIN_PASSWORD) role = 'admin';
  else if (password === process.env.STAFF_PASSWORD) role = 'staff';

  if (role) {
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24, // 24 hours
    };

    cookieStore.set('admin_auth', password, cookieOptions);
    cookieStore.set('staff_id', staffId || '不明なスタッフ', cookieOptions);
    cookieStore.set('user_role', role, cookieOptions);
    
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 401 });
}
