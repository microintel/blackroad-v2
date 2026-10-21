/* Keyboard shortcuts list shown in Settings (display only). */

const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";

const GROUPS = [
    {
        title: "Add & create",
        rows: [
            { keys: [ALT, "N"], text: "Add new: opens the add popup on Income, Stocks, Fixed Deposits, Lending (Add person / entry / loan) and Accounting (Add bank). On Mutual Fund it jumps to the daily entry box. In Rover it starts a new chat." },
            { keys: [MOD, "N"], text: "Same as above, but only where the browser allows it (for example the installed app). In a normal browser tab Ctrl+N opens a new window, so use Alt+N." }
        ]
    },
    {
        title: "Go to",
        rows: [
            { keys: [MOD, "R"], text: "Open Rover, the AI assistant." },
            { keys: [MOD, "K"], text: "Search stocks (on the Stocks page)." },
            { keys: ["←"], alt: ["→"], text: "Switch between the tabs of the current page." }
        ]
    },
    {
        title: "Popups",
        rows: [
            { keys: ["Esc"], text: "Close the open popup or dialog." }
        ]
    }
];

const kbd = (keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('<span class="acx-plus">+</span>');

export function shortcutsHTML() {
    return `
        <div class="acx-keys">
            <p class="acx-keys-intro">Shortcuts work with a keyboard on desktop. ${isMac ? "On Mac, ⌘ is Command and ⌥ is Option." : ""}</p>
            ${GROUPS.map((g) => `
                <section class="acx-keys-group">
                    <h3>${g.title}</h3>
                    <ul>
                        ${g.rows.map((r) => `
                            <li>
                                <span class="acx-keys-combo">${kbd(r.keys)}${r.alt ? `<span class="acx-keys-or">/</span>${kbd(r.alt)}` : ""}</span>
                                <span class="acx-keys-text">${r.text}</span>
                            </li>`).join("")}
                    </ul>
                </section>`).join("")}
        </div>`;
}
