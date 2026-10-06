import express from "express";
import Provider from "oidc-provider";

const ISSUER = "http://idp.localhost:4000";

const provider = new Provider(ISSUER, {});
const app = express();

app.get("/hello", (_req, res) => {
    res.send("hello from idp");
});

app.use(provider.callback());

app.listen(4000, () => console.log(`IdP listening on ${ISSUER}`));
