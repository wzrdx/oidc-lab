export const authConfig = {
    issuer: "http://idp.localhost:4000",
    audience: "http://api.localhost:5000",
    jwksUri: "http://idp.localhost:4000/jwks",
} as const;
