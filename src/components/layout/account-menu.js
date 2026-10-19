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
import { toggleTheme, getTheme, getVariant, VARIANTS } from "../../services/preferences.js";
import { toggleCurrency, getCurrency } from "../../services/currency.js";
import { startCurrencyTransition } from "../currency-transition.js";
import { openLookPicker } from "../look-picker.js";
import { themeToggleContent, currencyToggleContent } from "./topbar.js";

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

    root.querySelector("[data-look]")?.addEventListener("click", () => {
        close();
        openLookPicker();
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

    /* Phones: Notifications, Theme and Currency live in this menu. The same
       toggles as the header buttons (which are hidden on phones). */
    const themeBtn = root.querySelector('[data-pref="theme"]');
    const curBtn = root.querySelector('[data-pref="currency"]');

    const paintTheme = (theme = getTheme()) => {
        const ui = themeToggleContent(theme);

        themeBtn.querySelector(".br-account-item-icon").innerHTML = ui.icon;
        themeBtn.querySelector(".br-account-item-text").textContent = "Theme: " + (VARIANTS.find((v) => v.id === getVariant(theme === "light" ? "light" : "dark"))?.label || "Dark");
        themeBtn.setAttribute("aria-label", ui.label);
    };

    const paintCurrency = (currency = getCurrency()) => {
        const ui = currencyToggleContent(currency);

        curBtn.querySelector(".br-account-item-icon").innerHTML = ui.icon;
        curBtn.querySelector(".br-account-item-text").textContent = currency === "USD" ? "Currency: US dollars" : "Currency: Rupees";
        curBtn.setAttribute("aria-label", ui.label);
        curBtn.classList.remove("is-busy");
    };

    paintTheme();
    paintCurrency();

    root.querySelector("[data-account-notify]").addEventListener("click", () => {
        close();
        navigate("/notifications");
    });

    themeBtn.addEventListener("click", () => {
        const r = button.getBoundingClientRect();

        close();
        toggleTheme({ el: button, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });

    curBtn.addEventListener("click", () => {
        close();
        curBtn.classList.add("is-busy");
        startCurrencyTransition(getCurrency() === "USD" ? "INR" : "USD");
        toggleCurrency();
    });

    const onTheme = (e) => {
        if (!root.isConnected) return window.removeEventListener("br:theme-change", onTheme);
        paintTheme(e.detail?.theme);
    };
    const onCur = (e) => {
        if (!root.isConnected) return window.removeEventListener("br:currency-change", onCur);
        paintCurrency(e.detail?.currency);
    };
    const onErr = () => {
        if (!root.isConnected) return window.removeEventListener("br:currency-error", onErr);
        curBtn.classList.remove("is-busy");
    };

    window.addEventListener("br:theme-change", onTheme);
    window.addEventListener("br:currency-change", onCur);
    window.addEventListener("br:currency-error", onErr);

    header.__refreshAccount = refresh;
    refresh();
}

