import { oidcConfig } from '@/lib/auth/config';
import { type DiscoveryDocument, getDiscoveryDocument } from '@/lib/auth/discovery';
import { createLoginTransaction, LOGIN_TX_COOKIE, loginTxCookieOptions } from '@/lib/auth/login-transactions';
import { pkceChallenge } from '@/lib/auth/random';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
    const discoveryDocument: DiscoveryDocument = await getDiscoveryDocument();
    const { txId, loginTransaction } = createLoginTransaction();

    const authorizationUrl = new URL(discoveryDocument.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
        client_id: oidcConfig.clientId,
        redirect_uri: oidcConfig.redirectUri,
        response_type: 'code',
        scope: 'openid notes:read notes:write',
        resource: oidcConfig.notesApiUrl,
        state: loginTransaction.state,
        nonce: loginTransaction.nonce,
        code_challenge: pkceChallenge(loginTransaction.codeVerifier),
        code_challenge_method: 'S256',
    }).toString();

    const response = NextResponse.redirect(authorizationUrl.toString());
    response.cookies.set(LOGIN_TX_COOKIE, txId, loginTxCookieOptions);

    return response;
}
