import 'server-only';
import { oidcConfig } from './auth/config';
import { getFreshAccessToken } from './auth/fresh-access-token';
import { RefreshRejectedError } from './auth/refresh';
import { deleteSession, getCurrentSessionId } from './auth/session';

// The user has to sign in again: no session, a rejected refresh token, or a 401 even after a refresh.
// A class (not a plain Error) so callers can tell it apart from real failures with instanceof.
export class SignedOutError extends Error {
    constructor(reason: string) {
        super(`Signed out: ${reason}`);
        this.name = 'SignedOutError';
    }
}

// What notes-api returns for a note. Only display data: safe to pass to components.
export interface Note {
    id: string;
    text: string;
    createdAt: string;
}

// Ends the local session, then reports it. Without the delete, the page would still say
// "Signed in as ..." next to "please sign in again".
function signOut(sessionId: string, reason: string): never {
    deleteSession(sessionId);
    throw new SignedOutError(reason);
}

// An access token for this session, refreshed if needed (at most one refresh per session, see getFreshAccessToken).
// Only a rejected refresh token signs the user out. Other refresh errors (IdP down, 500) propagate
// as ordinary errors: the session may work again once the IdP recovers.
async function obtainAccessToken(sessionId: string, force: boolean): Promise<string> {
    let token: string | undefined;
    try {
        token = await getFreshAccessToken(sessionId, { force });
    } catch (error) {
        if (error instanceof RefreshRejectedError) {
            return signOut(sessionId, 'refresh token rejected');
        }
        throw error;
    }

    // undefined: the session is gone (never existed, or logged out during the refresh).
    if (!token) {
        throw new SignedOutError('no session');
    }
    return token;
}

// The only place in notes-app that sends the access token anywhere.
async function notesApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const sessionId = await getCurrentSessionId();
    if (!sessionId) {
        throw new SignedOutError('no session');
    }

    const send = async (accessToken: string) => {
        const headers = new Headers(init.headers); // accepts an object, [name, value] pairs, or a Headers instance
        headers.set('Authorization', `Bearer ${accessToken}`);
        return fetch(`${oidcConfig.notesApiUrl}${path}`, {
            ...init,
            headers,
            cache: 'no-store', // per-user data: never serve it from Next's fetch cache
        });
    };

    let response = await send(await obtainAccessToken(sessionId, false));

    if (response.status === 401) {
        // notes-api rejected a token we thought was valid (clock skew, an IdP key change...).
        // Its reason is in WWW-Authenticate; never log the token itself.
        console.warn(`[notes-api] 401 on ${path}, refreshing and retrying once: ${response.headers.get('www-authenticate')}`);

        // Retrying is safe even for POST/DELETE: the guard rejects before the handler runs, so
        // nothing happened. The body is a string here, so it can be sent again (a stream couldn't).
        response = await send(await obtainAccessToken(sessionId, true));

        // A brand-new token rejected too: the problem isn't the token's age. Retrying again would loop.
        if (response.status === 401) {
            console.warn(`[notes-api] 401 on ${path} after refresh: ${response.headers.get('www-authenticate')}`);
            return signOut(sessionId, 'notes-api rejected a freshly refreshed access token');
        }
    }

    if (response.status === 403) {
        // Valid token, missing scope: our scope configuration is wrong. Signing in again won't help.
        throw new Error(`notes-api 403 on ${path}: ${response.headers.get('www-authenticate')}`);
    }

    if (!response.ok) {
        throw new Error(`notes-api ${response.status} on ${path}`);
    }

    // 204 No Content has no body: response.json() would throw.
    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

export function listNotes(): Promise<Note[]> {
    return notesApiFetch<Note[]>('/notes');
}

export function createNote(text: string): Promise<Note> {
    return notesApiFetch<Note>('/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
}

export function deleteNote(id: string): Promise<void> {
    // encodeURIComponent: an id with "/" or "?" must not change which route is called.
    return notesApiFetch<void>(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
