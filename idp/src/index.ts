import express from "express";
import Provider, { type ClientMetadata, type Configuration } from "oidc-provider";

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

// Configuration
const clients: ClientMetadata[] = [
    {
        client_id: "notes-app",
        client_secret: NOTES_APP_CLIENT_SECRET,
        redirect_uris: ["http://app.localhost:3000/auth/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code"],
        scope: "openid",
        token_endpoint_auth_method: "client_secret_basic",
    },
];

const configuration: Configuration = { clients, cookies: { keys: COOKIE_KEYS.split(",") } };

const provider = new Provider(ISSUER, configuration);

// Express
const app = express();

app.get("/hello", (_req, res) => {
    res.send("hello from idp");
});

app.use(provider.callback());

app.listen(4000, () => console.log(`IdP listening on ${ISSUER}`));
