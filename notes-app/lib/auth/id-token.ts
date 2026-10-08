import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import 'server-only';
import { oidcConfig } from './config';
import { getDiscoveryDocument, type DiscoveryDocument } from './discovery';

// Created once and reused, so jose's key cache survives across logins.
// createRemoteJWKSet fetches lazily, on first use, so a failed fetch isn't cached here.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload & { sub: string }> {
    const discoveryDocument: DiscoveryDocument = await getDiscoveryDocument();
    jwks ??= createRemoteJWKSet(new URL(discoveryDocument.jwks_uri));

    const { payload, protectedHeader } = await jwtVerify(idToken, jwks, {
        issuer: oidcConfig.issuer,
        audience: oidcConfig.clientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'nonce'],
    });

    if (payload.nonce !== expectedNonce) {
        throw new Error('Invalid nonce');
    }

    console.log(
        `[id-token] verified: sub=${payload.sub}, kid=${protectedHeader.kid}, exp=${new Date(payload.exp! * 1000).toISOString()}`,
    );

    return payload as JWTPayload & { sub: string };
}
