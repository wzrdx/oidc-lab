import { cookies } from 'next/headers';
import 'server-only';
import { randomToken } from './random';

export const SESSION_COOKIE = 'session';

export const sessionCookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
} as const;

export interface Session {
    createdAt: number;
    sub: string;
    idToken: string;
    accessToken: string;
    accessTokenExpiresAt: number; // epoch ms, absolute
    // Long-lived (days) and rotated on every refresh: the most valuable credential here.
    // Stays in this store only: never in a cookie, a prop, or a log.
    refreshToken: string;
}

const g = globalThis as typeof globalThis & {
    sessions?: Map<string, Session>;
};

const store = g.sessions ?? (g.sessions = new Map());

export function createSession({
    sub,
    idToken,
    accessToken,
    expiresIn,
    refreshToken,
}: {
    sub: string;
    idToken: string;
    accessToken: string;
    expiresIn: number; // seconds, as in the token response's expires_in
    refreshToken: string;
}): string {
    const session: Session = {
        createdAt: Date.now(),
        sub,
        idToken,
        accessToken,
        accessTokenExpiresAt: Date.now() + expiresIn * 1000,
        refreshToken,
    };

    const sessionId = randomToken();
    store.set(sessionId, session);

    return sessionId;
}

// For pages and components: only display data, no tokens.
export async function getCurrentUser(): Promise<{ sub: string } | undefined> {
    const session = await getSession();
    return session ? { sub: session.sub } : undefined;
}

// For server code that needs tokens.
export async function getSession(): Promise<Session | undefined> {
    const c = await cookies();
    const sessionId = c.get(SESSION_COOKIE)?.value;

    if (!sessionId) {
        return undefined;
    }

    return store.get(sessionId);
}

// Saves the result of a refresh: a new access token and the rotated refresh token.
// This is why sessions live server-side: a refresh can happen while a server component renders,
// and server components can't set cookies. The cookie keeps the same session ID; only the store changes.
// Returns false if the session is gone (e.g. the user logged out while the refresh was running):
// a logged-out session must not come back to life.
export function updateSessionTokens(
    sessionId: string,
    { accessToken, expiresIn, refreshToken }: { accessToken: string; expiresIn: number; refreshToken: string },
): boolean {
    const session = store.get(sessionId);
    if (!session) {
        return false;
    }

    session.accessToken = accessToken;
    session.accessTokenExpiresAt = Date.now() + expiresIn * 1000;
    session.refreshToken = refreshToken;
    return true;
}

export function deleteSession(sessionId: string): void {
    store.delete(sessionId);
}

// Ends the session the current request belongs to. Server components can't clear cookies,
// so the cookie stays behind, pointing at nothing: getSession() then returns undefined.
export async function deleteCurrentSession(): Promise<void> {
    const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
    if (sessionId) {
        deleteSession(sessionId);
    }
}
