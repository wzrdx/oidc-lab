import 'server-only';
import { oidcConfig } from './auth/config';
import { deleteCurrentSession, getSession } from './auth/session';

// The user has to sign in again: no session, an expired access token, or a 401 from notes-api.
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

// Treat the token as expired slightly early, so it can't expire while the request is on its way.
const EXPIRY_MARGIN_MS = 10_000;

// Ends the local session, then reports it. Without the delete, the page would still say
// "Signed in as ..." next to "please sign in again". Phase 4 replaces this with a refresh.
async function signedOut(reason: string): Promise<never> {
    await deleteCurrentSession();
    throw new SignedOutError(reason);
}

// The only place in notes-app that sends the access token anywhere.
async function notesApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const session = await getSession();
    if (!session) {
        throw new SignedOutError('no session');
    }

    if (Date.now() >= session.accessTokenExpiresAt - EXPIRY_MARGIN_MS) {
        return signedOut('access token expired');
    }

    const headers = new Headers(init.headers); // accepts an object, [name, value] pairs, or a Headers instance
    headers.set('Authorization', `Bearer ${session.accessToken}`);

    const response = await fetch(`${oidcConfig.notesApiUrl}${path}`, {
        ...init,
        headers,
        cache: 'no-store', // per-user data: never serve it from Next's fetch cache
    });

    if (response.status === 401) {
        // notes-api rejected the token. Its reason is in WWW-Authenticate; never log the token itself.
        console.warn(`[notes-api] 401 on ${path}: ${response.headers.get('www-authenticate')}`);
        return signedOut('notes-api rejected the access token');
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
