import express from "express";
import Provider, {
    type ClientMetadata,
    type Configuration,
    errors,
    type ResourceServer,
} from "oidc-provider";

process.loadEnvFile(); // loads .env from the process cwd (idp/ when you run pnpm --filter idp)

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const NOTES_APP_CLIENT_SECRET = requireEnv("NOTES_APP_CLIENT_SECRET");
const COOKIE_KEYS = requireEnv("COOKIE_KEYS");

const ISSUER = "http://idp.localhost:4000";

// The one API this IdP issues access tokens for. RFC 8707 requires the resource
// indicator to be an absolute URI; the IdP treats it as an identifier and never calls it.
const NOTES_API_RESOURCE = "http://api.localhost:5000";
const NOTES_API_SCOPES = ["notes:read", "notes:write"];
const ACCESS_TOKEN_TTL_SECONDS = 60; // short on purpose, so expiry and refresh are easy to test

// Configuration
const clients: ClientMetadata[] = [
    {
        client_id: "notes-app",
        client_secret: NOTES_APP_CLIENT_SECRET,
        redirect_uris: ["http://app.localhost:3000/auth/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        scope: "openid offline_access",
        token_endpoint_auth_method: "client_secret_basic",
    },
];

// Called whenever a client requests a token with a `resource` parameter: this is how the IdP
// learns which APIs exist, which scopes each understands, and what its access tokens look like.
async function getResourceServerInfo(
    _ctx: unknown,
    resourceIndicator: string,
): Promise<ResourceServer> {
    if (resourceIndicator === NOTES_API_RESOURCE) {
        return {
            scope: NOTES_API_SCOPES.join(" "),
            audience: NOTES_API_RESOURCE, // becomes the token's `aud`, which notes-api checks
            accessTokenFormat: "jwt", // signed, self-contained: notes-api verifies it via JWKS, no call back here
            accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
            jwt: { sign: { alg: "RS256" } },
        };
    }

    // An unknown API gets no token at all (error=invalid_target).
    throw new errors.InvalidTarget();
}

const configuration: Configuration = {
    clients,
    cookies: { keys: COOKIE_KEYS.split(",") },
    features: {
        // Enabled by default in oidc-provider 9, but getResourceServerInfo throws until it's provided.
        resourceIndicators: { enabled: true, getResourceServerInfo },
    },
    rotateRefreshToken: true, // refresh tokens are rotated on every use
};

const provider = new Provider(ISSUER, configuration);

// Express
const app = express();

app.get("/hello", (_req, res) => {
    res.send("hello from idp");
});

app.use(provider.callback());

app.listen(4000, () => console.log(`IdP listening on ${ISSUER}`));
