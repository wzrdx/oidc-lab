import type { Note } from '@/lib/notes-api';

// Receives only display data (id, text, createdAt): never a token or the session.
export default function NotesList({ notes }: { notes: Note[] }) {
    if (notes.length === 0) {
        return <p className="text-sm text-zinc-500">No notes yet.</p>;
    }

    return (
        <ul className="flex w-full flex-col gap-2">
            {notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-black/8 bg-white px-4 py-3 text-sm">
                    <p className="whitespace-pre-wrap">{note.text}</p>
                    <time dateTime={note.createdAt} className="text-xs text-zinc-500">
                        {new Date(note.createdAt).toLocaleString('en-GB')}
                    </time>
                </li>
            ))}
        </ul>
    );
}
