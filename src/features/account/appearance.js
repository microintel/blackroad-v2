import { isSoundOn, setSound } from "../../services/preferences.js";

/* Appearance card. Mode / style / accent were retired with the
   single black-and-gold theme; only the click sound is a choice. */
export function AppearanceCard() {
    const card = document.createElement("section");
    card.className = "br-card br-appearance-card";
    card.style.marginTop = "20px";

    card.innerHTML = `
        <div class="br-card-heading"><h3>Appearance</h3></div>

        <div class="br-appearance-group" style="margin-bottom:0">
            <div class="br-appearance-row br-setting-row" data-group="sound">
                <div>
                    <b>Click sound</b>
                    <p>Play a soft click when you tap.</p>
                </div>
                <button type="button" class="br-switch" role="switch" data-value="1" aria-label="Click sound on tap"></button>
            </div>
        </div>
    `;

    function sync() {
        card.querySelectorAll("[data-value]").forEach((b) =>
            {
                b.setAttribute("aria-pressed", String(isSoundOn()));
                b.setAttribute("aria-checked", String(isSoundOn()));
            }
        );
    }

    card.addEventListener("click", (e) => {
        if (!e.target.closest("[data-value]")) return;
        setSound(!isSoundOn());
        sync();
    });

    sync();
    return card;
}
