import express from "express";
import Provider from "oidc-provider";

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

console.log(NOTES_APP_CLIENT_SECRET, COOKIE_KEYS);

const ISSUER = "http://idp.localhost:4000";

const provider = new Provider(ISSUER, {});
const app = express();

app.get("/hello", (_req, res) => {
    res.send("hello from idp");
});

app.use(provider.callback());

app.listen(4000, () => console.log(`IdP listening on ${ISSUER}`));
