import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete('admin_auth');
  cookieStore.delete('staff_id');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  return NextResponse.redirect(new URL('/login', baseUrl));
}
