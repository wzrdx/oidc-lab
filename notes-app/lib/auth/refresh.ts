import 'server-only';
import { clientAuthHeader } from './client-auth';
import { oidcConfig } from './config';
import { getDiscoveryDocument } from './discovery';

// The IdP refused the refresh token: expired, revoked, or already used (which revokes the whole
// grant). Nothing to retry: the session is over and the user has to sign in again.
export class RefreshRejectedError extends Error {
    constructor(reason: string) {
        super(`Refresh token rejected: ${reason}`);
        this.name = 'RefreshRejectedError';
    }
}

export interface RefreshedTokens {
    accessToken: string;
    expiresIn: number; // seconds
    refreshToken: string; // the rotated one: the token we sent is now used up
}

// Trades a refresh token for a new access token (and a new refresh token) at the token endpoint.
// Single-flight is not handled here: callers must make sure only one refresh per session runs at a time.
export async function refreshTokens(refreshToken: string): Promise<RefreshedTokens> {
    const { token_endpoint } = await getDiscoveryDocument();

    const response = await fetch(token_endpoint, {
        method: 'POST',
        headers: { Authorization: clientAuthHeader() },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            // Same as the code exchange: without resource, the new access token is an opaque
            // userinfo token instead of a JWT for notes-api.
            resource: oidcConfig.notesApiUrl,
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        // The error body may not be JSON (e.g. an HTML 502 page from a proxy).
        const { error, error_description } = (await response.json().catch(() => ({}))) as {
            error?: string;
            error_description?: string;
        };

        // invalid_grant = this refresh token is dead. Anything else (IdP down, 500, bad client
        // config) is an ordinary error: the session may still be fine once the IdP recovers.
        if (response.status === 400 && error === 'invalid_grant') {
            throw new RefreshRejectedError(error_description ?? 'invalid_grant');
        }
        throw new Error(`Refresh failed (HTTP ${response.status}): ${error ?? 'unknown_error'} - ${error_description ?? ''}`);
    }

    // The response also has a new id_token. It's ignored: the session keeps the original one,
    // and the user's identity doesn't change on refresh.
    const body = (await response.json()) as Record<string, unknown>;
    const { access_token, expires_in, refresh_token, token_type } = body;

    if (typeof access_token !== 'string' || typeof expires_in !== 'number') {
        throw new Error('Refresh response is missing access_token or expires_in');
    }
    // Rotation is on (rotateRefreshToken in the IdP), so a missing new refresh token means misconfiguration.
    // Carrying on with the old one would fail on the next refresh anyway.
    if (typeof refresh_token !== 'string') {
        throw new Error('Refresh response has no refresh_token: is rotation enabled on the IdP?');
    }
    // Same check as the callback: we only know how to send Bearer tokens.
    if (typeof token_type !== 'string' || token_type.toLowerCase() !== 'bearer') {
        throw new Error(`Refresh response has unexpected token_type=${JSON.stringify(token_type)}`);
    }

    // Never log the tokens themselves.
    console.log(`[refresh] tokens refreshed: expires_in=${expires_in}s, refresh_token rotated`);

    return { accessToken: access_token, expiresIn: expires_in, refreshToken: refresh_token };
}
