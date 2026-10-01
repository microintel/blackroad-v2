import { logout } from "../services/auth.js";

/* Small confirmation dialog built on the shared .br-modal styles.
   Resolves true when confirmed, false when cancelled (Cancel button,
   Escape, or a click outside the dialog). Cancel is focused first, so
   pressing Enter by reflex never confirms. */

export function confirmDialog({
    title = "Are you sure?",
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel"
} = {}) {
    return new Promise((resolve) => {
        const previous = document.activeElement;

        const layer = document.createElement("div");
        layer.className = "br-modal-layer br-confirm-layer";

        layer.innerHTML = `
            <div class="br-modal br-confirm" role="alertdialog" aria-modal="true"
                aria-labelledby="br-confirm-title" aria-describedby="br-confirm-text">
                <div class="br-confirm-body">
                    <h3 id="br-confirm-title"></h3>
                    <p id="br-confirm-text" class="br-muted"></p>
                </div>
                <div class="br-modal-footer br-confirm-footer">
                    <button type="button" class="br-button" data-confirm-cancel></button>
                    <button type="button" class="br-button br-button-primary" data-confirm-ok></button>
                </div>
            </div>
        `;

        layer.querySelector("#br-confirm-title").textContent = title;
        layer.querySelector("#br-confirm-text").textContent = message;

        const cancelBtn = layer.querySelector("[data-confirm-cancel]");
        const okBtn = layer.querySelector("[data-confirm-ok]");

        cancelBtn.textContent = cancelLabel;
        okBtn.textContent = confirmLabel;

        let done = false;

        const close = (result) => {
            if (done) return;
            done = true;

            document.removeEventListener("keydown", onKey, true);
            layer.remove();

            if (previous && previous.isConnected && previous.focus) {
                previous.focus();
            }

            resolve(result);
        };

        const onKey = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close(false);
                return;
            }

            if (event.key === "Tab") {
                const items = [cancelBtn, okBtn];
                const i = items.indexOf(document.activeElement);

                event.preventDefault();

                const next = event.shiftKey
                    ? items[(i <= 0 ? items.length : i) - 1]
                    : items[(i + 1) % items.length];

                next.focus();
            }
        };

        cancelBtn.addEventListener("click", () => close(false));
        okBtn.addEventListener("click", () => close(true));

        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(layer);

        cancelBtn.focus();
    });
}

/* Asks first, then runs the existing logout. Resolves true if the user
   was logged out. Callers decide where to go next. */
export async function confirmLogout() {
    const ok = await confirmDialog({
        title: "Logout",
        message: "Are you sure you want to logout?",
        confirmLabel: "Logout",
        cancelLabel: "Cancel"
    });

    if (!ok) return false;

    await logout();

    return true;
}
