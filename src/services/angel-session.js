/* =========================================================
   ANGEL ONE SESSION  (tab-only, never in BlackRoad's database)

   Keeps the broker connection alive across page changes and
   reloads until the user clicks Logout (or closes the tab).

   - Lives in this tab's sessionStorage only. It is NOT in
     IndexedDB, NOT in localStorage, and NOT in any backup or
     export, so it never leaves this browser tab.
   - Holds only: API key, Client ID and the session token.
     The PIN and TOTP are never stored anywhere.
   - clearAngelSession() removes everything. It runs on broker
     Logout and also when the user signs out of BlackRoad.
   - Fires "br-broker-change" whenever the connection changes,
     so the Connect Broker page and the sidebar can update.
   ========================================================= */

const KEY = "br_angel_session";
const EVENT = "br-broker-change";

// Mirror in memory, so it still works if sessionStorage is blocked.
let memory = null;

const emit = () => window.dispatchEvent(new CustomEvent(EVENT));

export const BROKER_EVENT = EVENT;

export function getAngelSession() {
    if (memory) return memory;

    try {
        const raw = sessionStorage.getItem(KEY);

        if (!raw) return null;

        const s = JSON.parse(raw);

        if (s && s.apiKey && s.jwt) {
            memory = { apiKey: s.apiKey, clientCode: s.clientCode || "", jwt: s.jwt };
            return memory;
        }
    } catch {
        /* ignore */
    }

    return null;
}

export function saveAngelSession({ apiKey, clientCode, jwt }) {
    memory = { apiKey, clientCode, jwt };

    try {
        sessionStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
        /* memory copy still works */
    }

    emit();
}

export function clearAngelSession() {
    const had = Boolean(memory) || (() => {
        try { return sessionStorage.getItem(KEY) !== null; } catch { return false; }
    })();

    memory = null;

    try {
        sessionStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }

    if (had) emit();
}

export const isAngelConnected = () => getAngelSession() !== null;
