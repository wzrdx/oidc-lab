import { createRemoteJWKSet, jwtVerify } from "jose";
import { authConfig } from "./auth.config.ts";

export interface AccessTokenPrincipal {
    sub: string;
    clientId: string;
    scopes: ReadonlySet<string>;
}

const jwks = createRemoteJWKSet(new URL(authConfig.jwksUri));

export async function verifyAccessToken(
    accessToken: string,
): Promise<AccessTokenPrincipal> {
    const { payload } = await jwtVerify(accessToken, jwks, {
        issuer: authConfig.issuer,
        audience: authConfig.audience,
        algorithms: ["RS256"],
        typ: "at+jwt",
        requiredClaims: ["sub", "client_id", "scope"],
    });

    if (
        typeof payload.scope !== "string" ||
        typeof payload.client_id !== "string" ||
        typeof payload.sub !== "string"
    ) {
        throw new Error("access token has malformed claims");
    }

    return {
        sub: payload.sub,
        clientId: payload.client_id,
        scopes: new Set(payload.scope.split(" ").filter(Boolean)),
    };
}
