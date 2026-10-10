import { oidcConfig } from '@/lib/auth/config';
import { deleteSession, getSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (sessionId) {
        deleteSession(sessionId);
    }

    const response = NextResponse.redirect(new URL('/', oidcConfig.redirectUri), 303);
    response.cookies.delete({ name: SESSION_COOKIE, path: sessionCookieOptions.path });
    return response;
}
