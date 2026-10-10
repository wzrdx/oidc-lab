import { oidcConfig } from '@/lib/auth/config';
import { verifyIdToken } from '@/lib/auth/id-token';
import { LOGIN_TX_COOKIE, loginTxCookieOptions, takeLoginTransaction } from '@/lib/auth/login-transactions';
import { createSession, deleteSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { exchangeCodeForTokens } from '@/lib/auth/token-exchange';
import { NextRequest, NextResponse } from 'next/server';

// The login_tx cookie must go on every response, success or failure.
// Deleting only replaces a cookie with the same name AND path, and
// cookies.delete(name) defaults to path "/", so pass the path it was set with.
function clearLoginTxCookie(response: NextResponse): NextResponse {
    response.cookies.delete({ name: LOGIN_TX_COOKIE, path: loginTxCookieOptions.path });
    return response;
}

// Detailed reason in the server log, generic message to the browser.
function fail(reason: string, error?: unknown): NextResponse {
    console.warn(`[callback] rejected: ${reason}`, ...(error === undefined ? [] : [error]));
    return clearLoginTxCookie(NextResponse.json({ error: 'Sign-in failed' }, { status: 400 }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const params = request.nextUrl.searchParams;

    // Take (and so delete) the transaction first, on every path, including the IdP error path:
    // it's single-use whatever happens next.
    const txId = request.cookies.get(LOGIN_TX_COOKIE)?.value;
    const loginTransaction = txId ? takeLoginTransaction(txId) : undefined;
    if (!loginTransaction) {
        return fail('no login transaction (missing cookie, unknown ID, expired, or already used)');
    }

    // Login CSRF check. Error responses carry state too, so this also stops
    // anyone from sending a user to /auth/callback?error=... with made-up text.
    if (params.get('state') !== loginTransaction.state) {
        return fail('state mismatch');
    }

    const idpError = params.get('error');
    if (idpError) {
        // JSON.stringify escapes newlines, so query input can't forge extra log lines.
        return fail(
            `IdP returned error=${JSON.stringify(idpError)} description=${JSON.stringify(params.get('error_description'))}`,
        );
    }

    const code = params.get('code');
    if (!code) {
        return fail('no code in callback');
    }

    let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
    try {
        tokens = await exchangeCodeForTokens(code, loginTransaction.codeVerifier);
    } catch (error) {
        return fail('token exchange failed', error);
    }

    // We'll send the access token as "Authorization: Bearer ...". Any other type
    // (e.g. DPoP) would need different handling, so refuse it here.
    if (tokens.token_type.toLowerCase() !== 'bearer') {
        return fail(`unexpected token_type=${JSON.stringify(tokens.token_type)}`);
    }

    let sub: string;
    try {
        ({ sub } = await verifyIdToken(tokens.id_token, loginTransaction.nonce));
    } catch (error) {
        return fail('id_token verification failed', error);
    }

    // Signing in again: drop the previous session so it doesn't linger in the store.
    const previousSessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (previousSessionId) {
        deleteSession(previousSessionId);
    }

    const sessionId = createSession({
        sub,
        idToken: tokens.id_token,
        accessToken: tokens.access_token,
        expiresIn: tokens.expires_in,
    });

    // Log who signed in, never the session ID: it's a bearer credential for this app.
    console.log(`[callback] session created for sub=${sub}`);

    // Not request.url: Next builds it from the server's bind address (localhost:3000),
    // not the Host header the browser sent. The redirect URI's origin is our configured public origin.
    const response = NextResponse.redirect(new URL('/', oidcConfig.redirectUri));
    response.cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions);
    return clearLoginTxCookie(response);
}
