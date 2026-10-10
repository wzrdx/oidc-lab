import 'server-only';

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const oidcConfig = {
    issuer: requireEnv('OIDC_ISSUER'),
    clientId: requireEnv('OIDC_CLIENT_ID'),
    clientSecret: requireEnv('OIDC_CLIENT_SECRET'),
    redirectUri: requireEnv('OIDC_REDIRECT_URI'),
    notesApiUrl: requireEnv('NOTES_API_URL'),
} as const;
