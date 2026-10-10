import { scopeSuffix } from "../../services/auth.js";

/*
 * Rover chat history. Stored in this browser only, separately for each
 * signed-in account (and for the guest demo). Storage can be blocked or
 * full, so every call is wrapped and Rover works fine without it.
 */

const MAX_MESSAGES = 60;

const key = () => `br-rover-chat-${scopeSuffix()}`;

export function loadHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(key()) || "[]");
        return Array.isArray(list) ? list.filter((m) => m && (m.role === "user" || m.role === "rover") && typeof m.text === "string") : [];
    } catch {
        return [];
    }
}

export function saveHistory(messages) {
    try {
        const trimmed = messages.slice(-MAX_MESSAGES).map(({ role, text, actions }) => ({ role, text, actions }));
        localStorage.setItem(key(), JSON.stringify(trimmed));
    } catch {
        /* storage unavailable: the chat simply won't be remembered */
    }
}

export function clearHistory() {
    try {
        localStorage.removeItem(key());
    } catch {
        /* ignore */
    }
}
