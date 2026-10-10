import Identity from '@/components/identity';
import NotesList from '@/components/notes-list';
import { getCurrentUser } from '@/lib/auth/session';
import { listNotes, type Note, SignedOutError } from '@/lib/notes-api';

// Loads the notes before anything renders. listNotes() deletes an expired session,
// and Identity has to see that, or it would still show "Signed in as ...".
async function loadNotes(): Promise<Note[] | 'signed-out'> {
    try {
        return await listNotes();
    } catch (error) {
        if (error instanceof SignedOutError) {
            return 'signed-out';
        }
        throw error; // a real failure (API down, 403): Next's error page, not "sign in again"
    }
}

export default async function Home() {
    const user = await getCurrentUser();
    const notesResponse = user ? await loadNotes() : undefined;

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 p-16 font-sans">
            <div className="flex">
                <Identity />
            </div>

            {notesResponse === 'signed-out' && (
                <p className="text-sm text-zinc-600">Your session has expired. Please sign in again.</p>
            )}

            {Array.isArray(notesResponse) && (
                <div className="flex w-full max-w-md flex-col items-center">
                    <NotesList notes={notesResponse} />
                </div>
            )}
        </div>
    );
}
