import { isSoundOn, setSound, VARIANTS, getVariant } from "../../services/preferences.js";
import { openLookPicker } from "../../components/look-picker.js";

/* Appearance card: theme selection and click sound. */
export function AppearanceCard() {
    const card = document.createElement("section");
    card.className = "br-card br-appearance-card";
    card.style.marginTop = "20px";

    card.innerHTML = `
        <div class="br-card-heading"><h3>Appearance</h3></div>

        <div class="lk-row">
            <div class="lk-row-text">
                <b>Theme</b>
                <span data-look-label></span>
            </div>
            <div class="lk-chips" data-look-chips aria-hidden="true"></div>
            <button type="button" class="lk-open" data-open-look>Change</button>
        </div>

        <div class="br-appearance-group" style="margin-bottom:0">
            <div class="br-appearance-row br-setting-row" data-group="sound">
                <div>
                    <b>Click sound</b>
                </div>
                <button type="button" class="br-switch" role="switch" data-value="1" aria-label="Click sound on tap"></button>
            </div>
        </div>
    `;

    function syncLook() {
        const v = VARIANTS.find((x) => x.id === getVariant()) || VARIANTS[1];
        card.querySelector("[data-look-label]").textContent = v.label;
        card.querySelector("[data-look-chips]").innerHTML = v.swatches
            ? v.swatches.map((c) => `<span class="lk-chip" style="background:${c}"></span>`).join("")
            : `<span class="lk-chip" style="background:${v.bg}"></span><span class="lk-chip" style="background:${v.accent}"></span>`;
    }

    function sync() {
        card.querySelectorAll("[data-value]").forEach((b) =>
            {
                b.setAttribute("aria-pressed", String(isSoundOn()));
                b.setAttribute("aria-checked", String(isSoundOn()));
            }
        );
    }

    card.addEventListener("click", (e) => {
        if (e.target.closest("[data-open-look]")) {
            openLookPicker();
            return;
        }
        if (!e.target.closest("[data-value]")) return;
        setSound(!isSoundOn());
        sync();
    });

    // The header toggle can change the theme too: keep the picker in step.
    const onChange = () => {
        if (!card.isConnected) return window.removeEventListener("br:theme-change", onChange);
        syncLook();
    };
    window.addEventListener("br:theme-change", onChange);

    sync();
    syncLook();
    return card;
}
