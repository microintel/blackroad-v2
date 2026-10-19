/* =========================================================
   UI STATES: empty, error, loading, success (+ offline)
   Presentational only. Nothing here reads or writes app data.
   - Helper functions return markup for new screens.
   - initStates() upgrades the states the app ALREADY renders
     (.br-empty-state, .br-toast, page error cards) without
     touching the code that produces them.
   Styles live in styles/states.css.
   ========================================================= */

const ICONS = {
    empty: '<path d="M3 7l2-3h14l2 3"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M3 7h5l1 3h6l1-3h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8.5 11h5"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
    bank: '<path d="m3 10 9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>',
    error: '<path d="M12 3 2.5 19.5a1 1 0 0 0 .9 1.5h17.2a1 1 0 0 0 .9-1.5z"/><path d="M12 9.5v4.5"/><path d="M12 17.5h.01"/>',
    offline: '<path d="M2 8.8a15 15 0 0 1 4-2.4M22 8.8a15 15 0 0 0-9-3.7"/><path d="M5 12.5a10 10 0 0 1 3.2-2M19 12.5a10 10 0 0 0-4.6-2.6"/><path d="M8.5 16.2a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="m3 3 18 18"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.8h.01"/>',
    warning: '<path d="M12 3 2.5 19.5a1 1 0 0 0 .9 1.5h17.2a1 1 0 0 0 .9-1.5z"/><path d="M12 9.5v4.5"/><path d="M12 17.5h.01"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    retry: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>'
};

export const stateIcon = (name, cls = "") =>
    `<svg class="br-st-svg ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.empty}</svg>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const action = (a, tone = "primary") => !a ? "" :
    `<button type="button" class="br-button br-button-${tone}" ${a.attrs || ""} ${a.retry ? "data-st-retry" : ""}>${a.icon ? stateIcon(a.icon, "br-st-btn-ico") : ""}${esc(a.label)}</button>`;

/* ---------- Markup helpers ---------- */

/* Nothing here yet: say what it is and what to do next. */
export function emptyState({ icon = "empty", title, text = "", primary, secondary, tone = "empty" } = {}) {
    return `
    <div class="br-state br-state-${tone}" role="status">
        <div class="br-st-art" aria-hidden="true"><span class="br-st-ring"></span>${stateIcon(icon)}</div>
        <h3 class="br-st-title">${esc(title)}</h3>
        ${text ? `<p class="br-st-text">${esc(text)}</p>` : ""}
        ${(primary || secondary) ? `<div class="br-st-actions">${action(primary)}${action(secondary, "secondary")}</div>` : ""}
    </div>`;
}

/* Something failed: say what happened, that data is safe, and how to retry. */
export function errorState({ title = "Something went wrong", text = "This didn't load. Your data is safe on this device.", detail = "", retryLabel = "Try again", home = true } = {}) {
    return `
    <div class="br-state br-state-error" role="alert">
        <div class="br-st-art" aria-hidden="true"><span class="br-st-ring"></span>${stateIcon("error")}</div>
        <h3 class="br-st-title">${esc(title)}</h3>
        <p class="br-st-text">${esc(text)}</p>
        ${detail ? `<details class="br-st-detail"><summary>Details</summary><code>${esc(detail)}</code></details>` : ""}
        <div class="br-st-actions">
            ${action({ label: retryLabel, icon: "retry", retry: true })}
            ${home ? action({ label: "Go to dashboard", attrs: 'data-st-home' }, "secondary") : ""}
        </div>
    </div>`;
}

/* Inline loading block for a card or section. */
export function loadingState({ text = "Loading…" } = {}) {
    return `
    <div class="br-state br-state-loading" role="status" aria-live="polite">
        <span class="br-st-spinner" aria-hidden="true"></span>
        <p class="br-st-text">${esc(text)}</p>
    </div>`;
}

/* Something worked: confirm it, then point to the next step. */
export function successState({ title = "All done", text = "", primary, secondary } = {}) {
    return `
    <div class="br-state br-state-success" role="status">
        <div class="br-st-art" aria-hidden="true">
            <span class="br-st-ring"></span>
            <svg class="br-st-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle class="br-st-draw-c" cx="12" cy="12" r="9"/><path class="br-st-draw-p" d="m8 12.5 2.8 2.8L16 9.8"/></svg>
        </div>
        <h3 class="br-st-title">${esc(title)}</h3>
        ${text ? `<p class="br-st-text">${esc(text)}</p>` : ""}
        ${(primary || secondary) ? `<div class="br-st-actions">${action(primary)}${action(secondary, "secondary")}</div>` : ""}
    </div>`;
}

/* Put a button into a busy state and back. Does not change its handler. */
export function setBusy(button, busy = true, label) {
    if (!button) return;
    if (busy) {
        if (!button.dataset.stLabel) button.dataset.stLabel = button.innerHTML;
        button.classList.add("is-loading");
        button.setAttribute("aria-busy", "true");
        button.disabled = true;
        if (label) button.textContent = label;
    } else {
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
        button.disabled = false;
        if (button.dataset.stLabel) { button.innerHTML = button.dataset.stLabel; delete button.dataset.stLabel; }
    }
}

/* ---------- Upgrade existing plain empty states ---------- */

const RULES = [
    { re: /couldn'?t|could not|can'?t|failed|unable|error|went wrong/i, tone: "error", icon: "error" },
    { re: /^\s*loading|loading the/i, tone: "loading", icon: "empty" },
    { re: /match|search|filter|no results/i, tone: "empty", icon: "search" },
    { re: /stock|holding|profit|loss|transaction|trade|nav|sip|fund|chart/i, tone: "empty", icon: "chart" },
    { re: /fixed deposit|\bfd\b|bank|maturit/i, tone: "empty", icon: "bank" },
    { re: /lend|borrow|balance|nobody|owe/i, tone: "empty", icon: "people" },
    { re: /notification|alert|due/i, tone: "empty", icon: "bell" },
    { re: /income|expense|entr|salary|spend|net worth|asset/i, tone: "empty", icon: "wallet" }
];

function upgradeEmpty(el) {
    if (el.dataset.st) return;
    el.dataset.st = "1";

    const text = el.textContent || "";
    const rule = RULES.find((r) => r.re.test(text)) || { tone: "empty", icon: "empty" };

    el.classList.add("br-st-upgraded", "br-state-" + rule.tone);
    if (rule.tone === "error") el.setAttribute("role", "alert");

    const art = document.createElement("div");
    art.className = "br-st-art";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML = rule.tone === "loading"
        ? '<span class="br-st-spinner"></span>'
        : `<span class="br-st-ring"></span>${stateIcon(rule.icon)}`;
    el.prepend(art);
}

/* ---------- Toasts: tone from the message, icon from the tone ---------- */

function toneOf(text) {
    if (/couldn'?t|could not|failed|can'?t|unable|error|invalid|not found/i.test(text)) return "error";
    if (/✓|saved|added|updated|deleted|synced|linked|imported|copied|done|restored|exported|unlinked|up to date/i.test(text)) return "success";
    if (/enter|choose|set |select|first|no active|already|doesn'?t look|no nav/i.test(text)) return "warning";
    return "info";
}

/* ---------- SweetAlert2 toasts ----------
   Same loading pattern as the PDF / Excel libraries: a local copy in
   assets/vendor first (works offline), then a pinned CDN. If it cannot
   load, the app's own toast (styled below in states.css) is used. */

const SWAL_VERSION = "11.14.5";
const swalSources = [
    new URL("../../assets/vendor/sweetalert2.all.min.js", import.meta.url).href,
    `https://cdn.jsdelivr.net/npm/sweetalert2@${SWAL_VERSION}/dist/sweetalert2.all.min.js`,
    `https://cdnjs.cloudflare.com/ajax/libs/limonte-sweetalert2/${SWAL_VERSION}/sweetalert2.all.min.js`
];

let swalPromise = null;

function loadSwal() {
    if (window.Swal) return Promise.resolve(window.Swal);
    if (swalPromise) return swalPromise;

    swalPromise = (async () => {
        for (const src of swalSources) {
            try {
                await new Promise((ok, fail) => {
                    const el = document.createElement("script");
                    el.src = src;
                    el.async = true;
                    el.onload = ok;
                    el.onerror = () => { el.remove(); fail(new Error("load")); };
                    document.head.appendChild(el);
                });
                if (window.Swal) return window.Swal;
            } catch (e) { /* try the next source */ }
        }
        swalPromise = null;           /* allow a later retry */
        return null;
    })();

    return swalPromise;
}

const isPhone = () => window.matchMedia("(max-width: 768px)").matches;
const cleanText = (t) => String(t || "").replace(/\s*[✓✔]\s*$/u, "").replace(/\s+/g, " ").trim();

/* Let a finger flick the toast away (up on phones, down on desktop's bottom toast). */
function enableSwipe(popup, close, dir) {
    let y0 = null;
    popup.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    popup.addEventListener("touchmove", (e) => {
        if (y0 == null) return;
        const dy = (e.touches[0].clientY - y0) * dir;      /* dir -1 = up */
        if (dy < 0) return;
        popup.style.transition = "none";
        popup.style.transform = `translateY(${dy * dir}px)`;
        popup.style.opacity = String(Math.max(0.3, 1 - dy / 120));
    }, { passive: true });
    popup.addEventListener("touchend", (e) => {
        if (y0 == null) return;
        const dy = ((e.changedTouches[0]?.clientY ?? y0) - y0) * dir;
        y0 = null;
        popup.style.transition = "";
        if (dy > 36) close();
        else { popup.style.transform = ""; popup.style.opacity = ""; }
    }, { passive: true });
}

/* Show one SweetAlert toast. Returns false if the library is not ready. */
let lastFire = { key: "", at: 0 };

function fireSwal(text, tone) {
    const Swal = window.Swal;
    if (!Swal || !text) return false;

    /* the class change and the text change can both report the same toast */
    const key = tone + "|" + text;
    const now = Date.now();
    if (key === lastFire.key && now - lastFire.at < 200) return true;
    lastFire = { key, at: now };

    const phone = isPhone();
    const top = phone;                         /* top on phones: clear of the bottom nav and the thumb */

    Swal.fire({
        toast: true,
        position: top ? "top" : "bottom",
        icon: tone,
        title: text,
        showConfirmButton: false,
        showCloseButton: false,
        timer: tone === "error" ? 4500 : 2600,
        timerProgressBar: true,
        showClass: { popup: top ? "br-swal-in-top" : "br-swal-in-bottom" },
        hideClass: { popup: top ? "br-swal-out-top" : "br-swal-out-bottom" },
        customClass: { popup: "br-swal-toast br-swal-" + tone, title: "br-swal-title", timerProgressBar: "br-swal-bar" },
        didOpen: (popup) => {
            popup.addEventListener("mouseenter", Swal.stopTimer);
            popup.addEventListener("mouseleave", Swal.resumeTimer);
            popup.addEventListener("click", () => Swal.close());
            if (phone) enableSwipe(popup, () => Swal.close(), -1);
        }
    });
    return true;
}

const watched = new WeakSet();

/* Tone only: writes a data-attribute, never the class list, so it cannot re-trigger the class observer. */
function setTone(el) {
    const tone = toneOf(el.textContent || "");
    el.dataset.tone = tone;
    el.setAttribute("role", tone === "error" ? "alert" : "status");
    el.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
}

function tuneToast(el) {
    setTone(el);

    const show = () => {
        const ok = fireSwal(cleanText(el.textContent), el.dataset.tone);
        /* hide the built-in toast only when SweetAlert really took over */
        el.classList.toggle("br-st-swal", ok);
        return ok;
    };

    /* the toast text can change while it is still showing */
    if (!watched.has(el)) {
        watched.add(el);
        new MutationObserver(() => {
            if (!el.classList.contains("show")) return;
            setTone(el);
            if (window.Swal) show();
        }).observe(el, { childList: true, characterData: true, subtree: true });
    }

    if (window.Swal) {
        show();
        return;
    }

    /* Not loaded yet: the built-in toast shows now; load the library for next time. */
    el.classList.remove("br-st-swal");
    el.classList.remove("br-st-pop");
    void el.offsetWidth;
    el.classList.add("br-st-pop");
    loadSwal();
}

/* ---------- Offline / back online ---------- */

let netTimer = null;
function netBanner(online) {
    let bar = document.getElementById("br-net");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "br-net";
        bar.className = "br-net";
        bar.setAttribute("role", "status");
        bar.setAttribute("aria-live", "polite");
        document.body.appendChild(bar);
    }
    clearTimeout(netTimer);
    bar.dataset.tone = online ? "success" : "warning";
    bar.innerHTML = online
        ? `${stateIcon("success")}<span><strong>Back online.</strong> Live prices will refresh.</span>`
        : `${stateIcon("offline")}<span><strong>You're offline.</strong> Your data is safe on this device.</span>`;
    requestAnimationFrame(() => bar.classList.add("is-visible"));
    if (online) netTimer = setTimeout(() => bar.classList.remove("is-visible"), 2600);
}

/* ---------- Boot ---------- */

export function initStates() {
    const app = document.getElementById("app");
    if (!app) return;

    const scan = (root) => {
        if (!root || root.nodeType !== 1) return;
        if (root.matches?.(".br-empty-state")) upgradeEmpty(root);
        root.querySelectorAll?.(".br-empty-state").forEach(upgradeEmpty);
    };

    scan(app);

    let queued = false;
    new MutationObserver((muts) => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; scan(app); });
    }).observe(app, { childList: true, subtree: true });

    /* Toasts are shown by adding .show; read the tone at that moment (only on the show transition). */
    new MutationObserver((muts) => {
        for (const m of muts) {
            const el = m.target;
            if (!el.classList?.contains("br-toast")) continue;
            const was = /(^|\s)show(\s|$)/.test(m.oldValue || "");
            if (el.classList.contains("show") && !was) tuneToast(el);
        }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true });

    /* Retry / home buttons rendered by errorState() and the page error cards. */
    document.addEventListener("click", (e) => {
        const retry = e.target.closest?.("[data-st-retry]");
        const home = e.target.closest?.("[data-st-home]");
        if (retry) {
            setBusy(retry, true, "Retrying…");
            /* the router re-renders the current page on popstate */
            setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate")), 250);
        } else if (home) {
            window.location.hash = "#/dashboard";
        }
    });

    /* Warm SweetAlert in the background so the first toast already uses it. */
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => loadSwal());

    window.addEventListener("offline", () => netBanner(false));
    window.addEventListener("online", () => netBanner(true));
    if (navigator.onLine === false) netBanner(false);
}
