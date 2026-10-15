/* =========================================================
   ACCOUNT MENU (desktop top bar)
   The profile picture opens a small menu: Account and Log out.
   The picture is the same one shown on the dashboard (the saved
   DiceBear avatar, the guest portrait, or the built-in avatar).
   Hidden on phones, where the slide-out menu and the log-out icon stay.
   ========================================================= */

import { avatarMarkup, avatarImg } from "../avatars.js";
import { loadAvatarUrl } from "../../services/avatar-service.js";
import { loadGuestAvatar } from "../../services/guest-avatar.js";
import { currentUser, isGuestSync, getGuestProfile, GUEST_PROFILES } from "../../services/auth.js";
import { navigate } from "../../app/router.js";

/* Picture + name for whoever is signed in. Never throws. */
async function whoAmI() {
    try {
        if (isGuestSync()) {
            const photo = loadGuestAvatar();
            const tier = getGuestProfile();

            return {
                name: "Guest",
                sub: tier ? GUEST_PROFILES[tier].label : "Read-only demo",
                html: photo ? avatarImg(photo, "guest") : avatarMarkup("", "guest")
            };
        }

        const user = await currentUser();
        const seed = (user && (user.email || user.name)) || "";

        return {
            name: (user && user.name) || "Account",
            sub: (user && user.email) || "",
            html: avatarMarkup(await loadAvatarUrl(), seed)
        };
    } catch {
        return { name: "Account", sub: "", html: avatarMarkup("", "") };
    }
}

export function mountAccountMenu(header) {
    const root = header.querySelector(".br-account-menu");
    if (!root) return;

    const button = root.querySelector("[data-account-menu-btn]");
    const pop = root.querySelector(".br-account-pop");
    const small = root.querySelector("[data-account-avatar]");
    const large = root.querySelector("[data-account-avatar-lg]");
    const nameEl = root.querySelector("[data-account-name]");
    const subEl = root.querySelector("[data-account-sub]");

    let shown = "";

    const close = () => {
        pop.hidden = true;
        button.setAttribute("aria-expanded", "false");
    };

    const open = () => {
        pop.hidden = false;
        button.setAttribute("aria-expanded", "true");
    };

    async function refresh() {
        const me = await whoAmI();
        const sig = me.html + "|" + me.name + "|" + me.sub;

        if (sig === shown) return;
        shown = sig;

        small.innerHTML = me.html;
        large.innerHTML = me.html;
        nameEl.textContent = me.name;
        subEl.textContent = me.sub;
        subEl.hidden = !me.sub;
    }

    button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (pop.hidden) open();
        else close();
    });

    root.querySelector("[data-account-go]").addEventListener("click", () => {
        close();
        navigate("/account");
    });

    // Log out is wired in app.js (it asks for confirmation); just close the menu.
    root.querySelector('[data-action="logout"]').addEventListener("click", close);

    document.addEventListener("click", (event) => {
        if (!pop.hidden && !root.contains(event.target)) close();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !pop.hidden) {
            close();
            button.focus();
        }
    });

    header.__refreshAccount = refresh;
    refresh();
}

