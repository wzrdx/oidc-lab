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
}: {
    sub: string;
    idToken: string;
    accessToken: string;
    expiresIn: number; // seconds, as in the token response's expires_in
}): string {
    const session: Session = {
        createdAt: Date.now(),
        sub,
        idToken,
        accessToken,
        accessTokenExpiresAt: Date.now() + expiresIn * 1000,
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
