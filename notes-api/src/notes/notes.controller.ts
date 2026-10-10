import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/access-token.guard.ts";
import { RequireScopes } from "../auth/require-scopes.decorator.ts";
import { type NoteView, NotesService } from "./notes.service.ts";

const MAX_TEXT_LENGTH = 1000;

// The owner always comes from the verified token (req.principal.sub),
// never from the body or a header: the client can't pick whose notes it touches.
@Controller("notes")
export class NotesController {
    constructor(private readonly notes: NotesService) {}

    @RequireScopes("notes:read")
    @Get()
    list(@Req() req: AuthenticatedRequest): NoteView[] {
        return this.notes.list(req.principal.sub);
    }

    @RequireScopes("notes:write")
    @Post()
    create(@Req() req: AuthenticatedRequest, @Body() body: unknown): NoteView {
        return this.notes.create(req.principal.sub, parseText(body));
    }

    @RequireScopes("notes:write")
    @Delete(":id")
    @HttpCode(204)
    delete(@Req() req: AuthenticatedRequest, @Param("id") id: string): void {
        this.notes.delete(req.principal.sub, id);
    }
}

// Hand-written validation: the body is untrusted input of unknown shape.
function parseText(body: unknown): string {
    const text =
        typeof body === "object" && body !== null && "text" in body
            ? body.text
            : undefined;
    if (typeof text !== "string") {
        throw new BadRequestException('"text" must be a string');
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) {
        throw new BadRequestException(
            `"text" must be 1-${MAX_TEXT_LENGTH} characters`,
        );
    }
    return trimmed;
}
