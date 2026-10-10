import { oidcConfig } from '@/lib/auth/config';
import { deleteSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

// Idempotent: with no session (already logged out, or the store was emptied by a restart)
// the user still ends up logged out, so clear the cookie and redirect either way.
export async function POST(request: NextRequest): Promise<NextResponse> {
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (sessionId) {
        deleteSession(sessionId);
    }

    const response = NextResponse.redirect(new URL('/', oidcConfig.redirectUri), 303);
    response.cookies.delete({ name: SESSION_COOKIE, path: sessionCookieOptions.path });
    return response;
}
