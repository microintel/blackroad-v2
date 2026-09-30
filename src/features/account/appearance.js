import { isSoundOn, setSound } from "../../services/preferences.js";

/* Appearance card. Mode / style / accent were retired with the
   single black-and-gold theme; only the click sound is a choice. */
export function AppearanceCard() {
    const card = document.createElement("section");
    card.className = "br-card";
    card.style.marginTop = "20px";

    card.innerHTML = `
        <div class="br-card-heading"><h3>Appearance</h3></div>

        <div class="br-appearance-group" style="margin-bottom:0">
            <span>Sound</span>
            <div class="br-appearance-row" data-group="sound">
                <button type="button" class="br-chip" data-value="1">Click sound on tap</button>
            </div>
        </div>
    `;

    function sync() {
        card.querySelectorAll("[data-value]").forEach((b) =>
            b.setAttribute("aria-pressed", String(isSoundOn()))
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
