import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface Note {
    id: string;
    ownerSub: string;
    text: string;
    createdAt: string;
}

// What callers see: ownerSub stays internal.
export type NoteView = Omit<Note, "ownerSub">;

const toView = ({ id, text, createdAt }: Note): NoteView => ({
    id,
    text,
    createdAt,
});

// In-memory store: emptied on restart (persistence isn't this phase's point).
// Every method takes ownerSub, so no code path can reach another user's notes.
@Injectable()
export class NotesService {
    private readonly notes = new Map<string, Note>();

    list(ownerSub: string): NoteView[] {
        return [...this.notes.values()]
            .filter((note) => note.ownerSub === ownerSub)
            .map(toView);
    }

    create(ownerSub: string, text: string): NoteView {
        const note: Note = {
            id: randomUUID(),
            ownerSub,
            text,
            createdAt: new Date().toISOString(),
        };
        this.notes.set(note.id, note);
        return toView(note);
    }

    delete(ownerSub: string, id: string): void {
        const note = this.notes.get(id);
        // Missing and someone else's look identical: a 403 would confirm the ID exists.
        if (!note || note.ownerSub !== ownerSub) {
            throw new NotFoundException();
        }
        this.notes.delete(id);
    }
}
