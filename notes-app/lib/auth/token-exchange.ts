import 'server-only';
import { oidcConfig } from './config';
import { type DiscoveryDocument, getDiscoveryDocument } from './discovery';

export async function exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
): Promise<{
    access_token: string;
    id_token: string;
    expires_in: number;
    token_type: string;
}> {
    const discoveryDocument: DiscoveryDocument = await getDiscoveryDocument();

    const basic = Buffer.from(
        `${encodeURIComponent(oidcConfig.clientId)}:${encodeURIComponent(oidcConfig.clientSecret)}`,
        'utf8',
    ).toString('base64');

    // RFC 6749 §4.1.3: parameters go in the form-encoded body, never the URL.
    // fetch sets Content-Type: application/x-www-form-urlencoded for a URLSearchParams body.
    const response = await fetch(discoveryDocument.token_endpoint, {
        headers: {
            Authorization: `Basic ${basic}`,
        },
        method: 'POST',
        body: new URLSearchParams({
            redirect_uri: oidcConfig.redirectUri,
            code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            // Must repeat the authorize request's resource: without it, oidc-provider issues
            // an opaque userinfo token instead of a JWT for notes-api.
            resource: oidcConfig.notesApiUrl,
        }),
    });

    if (!response.ok) {
        // The error body may not be JSON (e.g. an HTML 502 page from a proxy).
        const { error, error_description } = (await response.json().catch(() => ({}))) as {
            error?: string;
            error_description?: string;
        };
        throw new Error(
            `Failed to exchange code for tokens (HTTP ${response.status}): ${error ?? 'unknown_error'} - ${error_description ?? 'no description'}`,
        );
    }

    const { access_token, id_token, expires_in, token_type } = (await response.json()) as {
        access_token: string;
        id_token: string;
        scope: string;
        expires_in: number;
        token_type: string;
    };

    // Never log the tokens themselves: they are bearer credentials.
    console.log(`[token-exchange] tokens received: token_type=${token_type}, expires_in=${expires_in}s`);

    return { access_token, id_token, expires_in, token_type };
}
