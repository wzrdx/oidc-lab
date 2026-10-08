import { oidcConfig } from '@/lib/auth/config';
import { type DiscoveryDocument, getDiscoveryDocument } from '@/lib/auth/discovery';
import { createLoginTransaction, LOGIN_TX_COOKIE, loginTxCookieOptions } from '@/lib/auth/login-transactions';
import { pkceChallenge } from '@/lib/auth/random';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
    const discoveryDocument: DiscoveryDocument = await getDiscoveryDocument();
    const { txId, loginTransaction } = createLoginTransaction();

    const authorizationUrl = new URL(discoveryDocument.authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', oidcConfig.clientId);
    authorizationUrl.searchParams.set('redirect_uri', oidcConfig.redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid');
    authorizationUrl.searchParams.set('state', loginTransaction.state);
    authorizationUrl.searchParams.set('nonce', loginTransaction.nonce);

    authorizationUrl.searchParams.set('code_challenge', pkceChallenge(loginTransaction.codeVerifier));
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const response = NextResponse.redirect(authorizationUrl.toString());
    response.cookies.set(LOGIN_TX_COOKIE, txId, loginTxCookieOptions);

    return response;
}
