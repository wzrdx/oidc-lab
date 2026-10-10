import {
    type CanActivate,
    type ExecutionContext,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { errors } from "jose";
import { IS_PUBLIC_KEY } from "./public.decorator.ts";
import {
    type NotesApiScope,
    REQUIRED_SCOPES_KEY,
} from "./require-scopes.decorator.ts";
import {
    type AccessTokenPrincipal,
    verifyAccessToken,
} from "./verify-access-token.ts";

// What handlers receive after the guard has run: the request plus the verified token's principal.
// Handlers read the caller's identity from here (principal.sub), never from the body or headers.
export type AuthenticatedRequest = Request & {
    principal: AccessTokenPrincipal;
};

// RFC 6750: "Bearer" (case-insensitive), one space, then a b64token. Anything else counts as no token.
const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;

// Registered globally (APP_GUARD in AppModule), so it runs before every route handler.
// Each request goes through three questions, in this order:
//   1. Is the route public?           yes → let it through, no token needed
//   2. Is the token valid?            no  → 401 "I don't know who you are"
//   3. Does it carry the scopes?      no  → 403 "I know who you are, but this token can't do this"
// A route that declares neither @Public() nor @RequireScopes() is rejected outright (fail closed).
@Injectable()
export class AccessTokenGuard implements CanActivate {
    private readonly logger = new Logger(AccessTokenGuard.name);

    constructor(private readonly reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const request = http.getRequest<
            Request & { principal?: AccessTokenPrincipal }
        >();
        const response = http.getResponse<Response>();
        const route = `${request.method} ${request.path}`;

        // Decorators can sit on the method or on the controller class.
        // getAllAndOverride checks the method first, so a method-level decorator wins.
        const targets = [context.getHandler(), context.getClass()];

        // 1. Public routes skip authentication entirely.
        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
            return true;
        }

        // Fail closed: a protected route must say which scopes it needs. Without a declaration we
        // can't know what a token should be allowed to do here, so nobody gets in.
        // This is a bug in our code, not the caller's fault, hence 500 and an error log, checked before
        // the token so it shows up on the very first request, with or without a token.
        const requiredScopes = this.reflector.getAllAndOverride<
            NotesApiScope[] | undefined
        >(REQUIRED_SCOPES_KEY, targets);
        if (!requiredScopes) {
            this.logger.error(
                `${route} has neither @Public() nor @RequireScopes(); rejecting every request`,
            );
            throw new InternalServerErrorException();
        }

        // 2. Authentication: is there a valid access token?
        const match = BEARER.exec(request.headers.authorization ?? "");
        if (!match) {
            this.logger.warn(`rejected ${route}: no bearer token`);
            // RFC 6750 §3: no credentials at all → challenge without an error code.
            // Nest's exceptions can't carry headers, so set it on the response before throwing;
            // Nest's exception handler writes its 401 to this same response object.
            response.setHeader("WWW-Authenticate", "Bearer");
            throw new UnauthorizedException();
        }

        let principal: AccessTokenPrincipal;
        try {
            principal = await verifyAccessToken(match[1]);
        } catch (error) {
            // Detailed reason in the log (jose's error codes, e.g. ERR_JWT_EXPIRED), generic response.
            const reason =
                error instanceof errors.JOSEError
                    ? `${error.code}: ${error.message}`
                    : String(error);
            this.logger.warn(`rejected ${route}: ${reason}`);
            response.setHeader(
                "WWW-Authenticate",
                'Bearer error="invalid_token"',
            );
            throw new UnauthorizedException();
        }

        // 3. Authorization: does this token allow this kind of action?
        // Scopes limit what the *client app* may do on the user's behalf. Whether the *user* may touch
        // a particular note is a separate check, done in the handler by comparing principal.sub.
        const missing = requiredScopes.filter(
            (scope) => !principal.scopes.has(scope),
        );
        if (missing.length > 0) {
            this.logger.warn(
                `rejected ${route}: sub=${principal.sub} client=${principal.clientId} lacks scope ${missing.join(" ")}`,
            );
            // RFC 6750 §3.1: tell the client which scopes the route needs, so it knows what to request.
            response.setHeader(
                "WWW-Authenticate",
                `Bearer error="insufficient_scope", scope="${requiredScopes.join(" ")}"`,
            );
            throw new ForbiddenException();
        }

        // Only attach the principal once every check has passed.
        request.principal = principal;
        return true;
    }
}
