import 'server-only';
import { oidcConfig } from './config';

export type DiscoveryDocument = {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
};

const REQUIRED_FIELDS = ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const;

// Cache the promise, not the result, so concurrent first calls share one fetch.
let cached: Promise<DiscoveryDocument> | undefined;

async function fetchDiscovery(): Promise<DiscoveryDocument> {
    const url = `${oidcConfig.issuer}/.well-known/openid-configuration`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`Discovery request to ${url} failed with HTTP ${res.status}`);
    }

    const doc: Record<string, unknown> = await res.json();
    for (const field of REQUIRED_FIELDS) {
        if (typeof doc[field] !== 'string') {
            throw new Error(`Discovery document is missing "${field}"`);
        }
    }

    // OIDC Discovery: the issuer must match exactly, otherwise
    // a wrong or spoofed document could point us at someone else's endpoints.
    if (doc.issuer !== oidcConfig.issuer) {
        throw new Error(`Discovery issuer mismatch: expected "${oidcConfig.issuer}", got "${doc.issuer}"`);
    }

    return doc as DiscoveryDocument;
}

export function getDiscoveryDocument(): Promise<DiscoveryDocument> {
    if (!cached) {
        cached = fetchDiscovery().catch((err) => {
            cached = undefined; // don't cache failures; the next call retries
            throw err;
        });
    }
    return cached;
}
