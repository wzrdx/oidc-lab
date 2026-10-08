import 'server-only';
import { randomToken } from './random';

const LOGIN_TX_TTL_SECONDS = 10 * 60;
export const LOGIN_TX_COOKIE = 'login_tx';

export const loginTxCookieOptions = {
    httpOnly: true, // page JavaScript can't read it
    sameSite: 'lax', // still sent on the top-level redirect back from the IdP
    path: '/auth', // only sent to the auth routes
    maxAge: LOGIN_TX_TTL_SECONDS,
    secure: false, // the lab is plain http://
} as const;

interface LoginTransaction {
    state: string;
    nonce: string;
    codeVerifier: string;
    expiresAt: number;
}

const g = globalThis as typeof globalThis & {
    loginTxns?: Map<string, LoginTransaction>;
};

const store = g.loginTxns ?? (g.loginTxns = new Map());

export function createLoginTransaction(): { txId: string; loginTransaction: LoginTransaction } {
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = randomToken();

    const txId = randomToken();

    const loginTransaction: LoginTransaction = {
        state,
        nonce,
        codeVerifier,
        expiresAt: Date.now() + LOGIN_TX_TTL_SECONDS * 1000,
    };

    store.set(txId, loginTransaction);

    console.log('createLoginTransaction', txId);

    return { txId, loginTransaction };
}

export function takeLoginTransaction(txId: string): LoginTransaction | undefined {
    const tx = store.get(txId);

    if (tx) {
        const isExpired = tx.expiresAt < Date.now();
        store.delete(txId);

        if (isExpired) {
            return undefined;
        }
    }

    return tx;
}
