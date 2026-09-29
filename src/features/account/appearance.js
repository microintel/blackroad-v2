import {
    STYLES, ACCENTS,
    getTheme, setTheme, getStyle, setStyle,
    getAccent, setAccent, isSoundOn, setSound
} from "../../services/preferences.js";

/* Appearance card: theme, UI style, accent colour, click sound. */
export function AppearanceCard() {
    const card = document.createElement("section");
    card.className = "br-card";
    card.style.marginTop = "20px";

    card.innerHTML = `
        <div class="br-card-heading"><h3>Appearance</h3></div>

        <div class="br-appearance-group">
            <span>Mode</span>
            <div class="br-appearance-row" data-group="theme">
                <button type="button" class="br-chip" data-value="light">Light</button>
                <button type="button" class="br-chip" data-value="dark">Dark</button>
            </div>
        </div>

        <div class="br-appearance-group">
            <span>Style</span>
            <div class="br-appearance-row" data-group="style">
                ${STYLES.map((s) => `<button type="button" class="br-chip" data-value="${s.id}">${s.label}</button>`).join("")}
            </div>
        </div>

        <div class="br-appearance-group">
            <span>Accent colour</span>
            <div class="br-appearance-row" data-group="accent">
                ${ACCENTS.map((a) => `<button type="button" class="br-swatch" data-value="${a.id}" title="${a.label}" aria-label="${a.label}" style="background:${a.color}"></button>`).join("")}
            </div>
        </div>

        <div class="br-appearance-group" style="margin-bottom:0">
            <span>Sound</span>
            <div class="br-appearance-row" data-group="sound">
                <button type="button" class="br-chip" data-value="1">Click sound on tap</button>
            </div>
        </div>
    `;

    const current = {
        theme: getTheme, style: getStyle, accent: getAccent,
        sound: () => (isSoundOn() ? "1" : "0")
    };

    function sync() {
        card.querySelectorAll("[data-group]").forEach((g) => {
            const now = current[g.dataset.group]();
            g.querySelectorAll("[data-value]").forEach((b) =>
                b.setAttribute("aria-pressed", String(b.dataset.value === now))
            );
        });
    }

    card.addEventListener("click", (e) => {
        const b = e.target.closest("[data-value]");
        if (!b) return;
        const group = b.parentElement.dataset.group;
        const v = b.dataset.value;
        if (group === "theme") setTheme(v);
        else if (group === "style") setStyle(v);
        else if (group === "accent") setAccent(v);
        else if (group === "sound") setSound(!isSoundOn());
        sync();
    });

    sync();
    return card;
}
