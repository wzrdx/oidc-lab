import { createHash, randomBytes } from 'node:crypto';
import 'server-only';

// 32 random bytes (256 bits), base64url-encoded: 43 URL-safe characters.
// Used for state, nonce, the PKCE code_verifier, and store IDs.
export function randomToken(): string {
    return randomBytes(32).toString('base64url');
}

// PKCE S256 (RFC 7636): code_challenge = base64url(SHA256(code_verifier)).
export function pkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}
