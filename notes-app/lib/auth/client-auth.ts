import 'server-only';
import { oidcConfig } from './config';

// client_secret_basic: how notes-app proves to the IdP that it's notes-app.
// RFC 6749 §2.3.1: form-encode the ID and the secret before joining them, so a secret with
// ":" or other special characters still splits correctly on the IdP's side.
// Used by every call to the IdP's back channel: token exchange, refresh, revocation.
export function clientAuthHeader(): string {
    const credentials = `${encodeURIComponent(oidcConfig.clientId)}:${encodeURIComponent(oidcConfig.clientSecret)}`;
    return `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
}
