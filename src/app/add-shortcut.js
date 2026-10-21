/* Alt+N (Option+N on Mac) = "add new" on a page.
   Ctrl+N is reserved by browsers for a new window, so Alt+N is the shortcut;
   Ctrl/Cmd+N is also accepted where the browser lets the page have it (installed app).
   `addNew(page)` is called only when no popup is open. The listener removes
   itself once the page is no longer on screen. */

export function bindAddShortcut(page, addNew) {
    const onKey = (event) => {
        if (!page.isConnected) {
            document.removeEventListener("keydown", onKey);
            return;
        }

        const isN = event.code === "KeyN" || String(event.key).toLowerCase() === "n";
        const viaAlt = event.altKey && !event.ctrlKey && !event.metaKey;
        const viaCtrl = (event.ctrlKey || event.metaKey) && !event.altKey;

        if (!isN || event.shiftKey || !(viaAlt || viaCtrl)) return;

        event.preventDefault();

        /* a popup / dialog is already open */
        const dialogOpen = [...document.querySelectorAll('.br-modal-layer:not([hidden]), [role="dialog"], [role="alertdialog"]')]
            .some((el) => el.getClientRects().length > 0);

        if (dialogOpen) return;

        addNew(page);
    };

    document.addEventListener("keydown", onKey);
}

/* Click the first visible button matching `selector` inside `page`. */
export function clickFirstVisible(page, selector) {
    const btn = [...page.querySelectorAll(selector)].find((b) => b.offsetParent !== null && !b.disabled);

    if (btn) btn.click();

    return !!btn;
}
