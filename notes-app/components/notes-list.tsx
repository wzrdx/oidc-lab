import { createNoteAction, deleteNoteAction } from '@/app/actions';
import type { Note } from '@/lib/notes-api';

// Receives only display data (id, text, createdAt): never a token or the session.
// Plain <form action={serverAction}>: works without client JavaScript, no client component needed.
export default function NotesList({ notes }: { notes: Note[] }) {
    return (
        <div className="flex w-full flex-col gap-4">
            <form action={createNoteAction} className="flex gap-2">
                <input
                    name="text"
                    required
                    maxLength={1000}
                    placeholder="New note"
                    className="flex-1 rounded-full border border-black/8 bg-white px-4 py-2 text-sm"
                />
                <button
                    type="submit"
                    className="bg-foreground text-background cursor-pointer rounded-full px-4 py-2 text-sm transition-colors hover:bg-[#484848]"
                >
                    Add
                </button>
            </form>

            {notes.length === 0 ? (
                <p className="text-sm text-zinc-500">No notes yet.</p>
            ) : (
                <ul className="flex w-full flex-col gap-2">
                    {notes.map((note) => (
                        <li
                            key={note.id}
                            className="flex items-start justify-between gap-4 rounded-lg border border-black/8 bg-white px-4 py-3 text-sm"
                        >
                            <div>
                                <p className="whitespace-pre-wrap">{note.text}</p>
                                <time dateTime={note.createdAt} className="text-xs text-zinc-500">
                                    {new Date(note.createdAt).toLocaleString('en-GB')}
                                </time>
                            </div>
                            <form action={deleteNoteAction}>
                                <input type="hidden" name="id" value={note.id} />
                                <button
                                    type="submit"
                                    className="cursor-pointer text-xs text-zinc-500 hover:text-red-700"
                                    aria-label="Delete note"
                                >
                                    Delete
                                </button>
                            </form>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
