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
        const trimmed = messages.slice(-MAX_MESSAGES).map(({ role, text, actions, blocks, choices, upload }) => ({ role, text, actions, blocks, choices, upload }));
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

/*
 * Commands you typed, newest last, for the Up / Down arrows in the message box (like a terminal).
 * Kept separately from the chat so they survive "New chat".
 */
const MAX_COMMANDS = 100;
const cmdKey = () => `br-rover-cmds-${scopeSuffix()}`;

export function loadCommands() {
    try {
        const list = JSON.parse(localStorage.getItem(cmdKey()) || "[]");
        return Array.isArray(list) ? list.filter((c) => typeof c === "string" && c.trim()) : [];
    } catch {
        return [];
    }
}

export function saveCommand(text) {
    const q = String(text || "").trim();
    if (!q) return;
    try {
        const list = loadCommands();
        if (list[list.length - 1] === q) return;
        list.push(q);
        localStorage.setItem(cmdKey(), JSON.stringify(list.slice(-MAX_COMMANDS)));
    } catch {
        /* storage unavailable: the arrows just remember less */
    }
}
