import { clientAuthHeader } from '@/lib/auth/client-auth';
import { oidcConfig } from '@/lib/auth/config';
import { type DiscoveryDocument, getDiscoveryDocument } from '@/lib/auth/discovery';
import { deleteSession, getSessionById, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

// Idempotent: with no session (already logged out, or the store was emptied by a restart)
// the user still ends up logged out, so clear the cookie and redirect either way.
export async function POST(request: NextRequest): Promise<NextResponse> {
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (sessionId) {
        const session = getSessionById(sessionId);

        if (session) {
            const discoveryDocument: DiscoveryDocument = await getDiscoveryDocument();

            try {
                const response = await fetch(discoveryDocument.revocation_endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: clientAuthHeader(),
                    },
                    body: new URLSearchParams({
                        token_type_hint: 'refresh_token',
                        token: session.refreshToken,
                    }),
                });

                if (!response.ok) {
                    console.warn(
                        `[logout] revocation failed: HTTP ${response.status}`,
                        await response.json().catch(() => ({})),
                    );
                }

                console.log('[logout] revoked refresh token successfully');
            } catch (error) {
                console.log(`Failed to revoke refresh token: ${error}`);
            }

            deleteSession(sessionId);
        }
    }

    const response = NextResponse.redirect(new URL('/', oidcConfig.redirectUri), 303);
    response.cookies.delete({ name: SESSION_COOKIE, path: sessionCookieOptions.path });
    return response;
}
