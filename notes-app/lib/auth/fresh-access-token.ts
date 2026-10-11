import 'server-only';
import { refreshTokens } from './refresh';
import { getSessionById, updateSessionTokens } from './session';

// Treat the token as expired slightly early, so it can't expire while a request is on its way.
const EXPIRY_MARGIN_MS = 10_000;

// Refreshes currently running, one per session at most. On globalThis like the stores, so
// hot reload doesn't create a second Map while a refresh from the old one is still running.
// Resolves to the new access token, or undefined if the session ended meanwhile.
const g = globalThis as typeof globalThis & {
    refreshesInFlight?: Map<string, Promise<string | undefined>>;
};
const inFlight = g.refreshesInFlight ?? (g.refreshesInFlight = new Map());

// Returns an access token valid for at least EXPIRY_MARGIN_MS, refreshing if needed.
// undefined = no session (never existed, or logged out during the refresh).
// Throws RefreshRejectedError if the IdP refused the refresh token: the caller ends the session.
// force: refresh even if the token looks valid (notes-api just rejected it with a 401).
export async function getFreshAccessToken(
    sessionId: string,
    { force = false }: { force?: boolean } = {},
): Promise<string | undefined> {
    const session = getSessionById(sessionId);
    if (!session) {
        return undefined;
    }

    // 1. Still valid: no IdP call.
    if (!force && Date.now() < session.accessTokenExpiresAt - EXPIRY_MARGIN_MS) {
        return session.accessToken;
    }

    // 2. Someone else is already refreshing this session: wait for their result.
    // Sending the same refresh token a second time would count as reuse and revoke the grant.
    // Also covers force: the running refresh produces a new token anyway.
    const running = inFlight.get(sessionId);
    if (running) {
        return running;
    }

    // 3. Start one. Set the entry before any await: between "not in the Map" and "in the Map"
    // nothing else may run, or two callers could both start a refresh.
    // finally: remove the entry on success and on failure, so the next expiry starts a new refresh
    // and a rejected refresh isn't handed out forever.
    const refresh = refreshSession(sessionId, session.refreshToken).finally(() => inFlight.delete(sessionId));
    inFlight.set(sessionId, refresh);
    return refresh;
}

async function refreshSession(sessionId: string, refreshToken: string): Promise<string | undefined> {
    const tokens = await refreshTokens(refreshToken);

    // false: the user logged out while the IdP was answering. Don't bring the session back.
    if (!updateSessionTokens(sessionId, tokens)) {
        return undefined;
    }
    return tokens.accessToken;
}
