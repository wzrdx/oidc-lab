import { SetMetadata } from "@nestjs/common";

export const REQUIRED_SCOPES_KEY = "requiredScopes";

// The scopes this API understands. They must match what the IdP registers for this resource
// (NOTES_API_SCOPES in idp/src/index.ts). A union type instead of plain strings means a typo like
// "note:read" is a compile error here, not a route that no token can ever reach.
export type NotesApiScope = "notes:read" | "notes:write";

// Declares which scopes a token must carry to call a route. All listed scopes are required (AND),
// so @RequireScopes("notes:read", "notes:write") needs both.
//
// The tuple type demands at least one scope: an empty @RequireScopes() would quietly mean
// "any valid token", which is exactly the kind of accidental opening the global guard prevents.
//
// It can go on a method or on a whole controller; a method-level declaration replaces the
// controller-level one (it doesn't add to it).
export const RequireScopes = (...scopes: [NotesApiScope, ...NotesApiScope[]]) =>
    SetMetadata(REQUIRED_SCOPES_KEY, scopes);
