'use server';

// Every export here is a public POST endpoint: anyone can call it with any FormData.
// So each action validates its input, and authorization happens inside notesApiFetch
// (the session's access token) and in notes-api (scopes + ownership by sub).
// CSRF: Next.js rejects Server Action requests whose Origin doesn't match the Host.

import { createNote, deleteNote, SignedOutError } from '@/lib/notes-api';
import { revalidatePath } from 'next/cache';

const MAX_TEXT_LENGTH = 1000; // same limit as notes-api

export async function createNoteAction(formData: FormData): Promise<void> {
    const text = formData.get('text');
    // The form's required/maxLength catch this in the browser; this is the real check.
    // Invalid input is ignored rather than turned into an error page.
    if (typeof text !== 'string' || text.trim().length === 0 || text.trim().length > MAX_TEXT_LENGTH) {
        return;
    }
    await callApi(() => createNote(text.trim()));
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
    const id = formData.get('id');
    if (typeof id !== 'string' || id.length === 0) {
        return;
    }
    // No ownership check here: notes-api returns 404 for someone else's note.
    await callApi(() => deleteNote(id));
}

// Runs the API call, then re-renders the home page with fresh data.
// SignedOutError: the session is already deleted, so the re-render shows "Sign in".
async function callApi(call: () => Promise<unknown>): Promise<void> {
    try {
        await call();
    } catch (error) {
        if (!(error instanceof SignedOutError)) {
            throw error;
        }
    }
    revalidatePath('/');
}
