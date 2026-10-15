/* =========================================================
   DOM PATCH
   setHTML(el, html, { patch }) works like el.innerHTML = html, but with
   patch:true only the parts that differ are touched. A live price update
   therefore changes the numbers in place: no rebuild, no flicker, logos and
   the input being typed in stay as they are, scroll position is kept.
   Elements with a data-key are matched by key, so a re-sorted list moves
   its cards instead of rewriting them.
   ========================================================= */

function keyOf(node) {
    return node.nodeType === 1 ? node.getAttribute("data-key") : null;
}

function syncAttributes(from, to) {
    for (const { name, value } of [...to.attributes]) {
        if (from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
    for (const { name } of [...from.attributes]) {
        if (!to.hasAttribute(name)) from.removeAttribute(name);
    }
}

function syncNode(from, to) {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
        from.replaceWith(to);
        return;
    }

    if (from.nodeType !== 1) {
        if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
        return;
    }

    // Never overwrite a field the user is typing in.
    if (from === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(from.nodeName)) return;

    syncAttributes(from, to);

    if (from.nodeName === "INPUT" && from.value !== to.getAttribute("value")) {
        from.value = to.getAttribute("value") ?? "";
    }

    patchChildren(from, to);
}

function patchChildren(from, to) {
    const next = [...to.childNodes];
    const keyed = new Map();

    [...from.childNodes].forEach((n) => {
        const k = keyOf(n);
        if (k != null) keyed.set(k, n);
    });

    next.forEach((want, i) => {
        const k = keyOf(want);
        let have = from.childNodes[i];

        if (k != null && keyed.has(k)) {
            const match = keyed.get(k);
            if (match !== have) from.insertBefore(match, have || null);
            syncNode(match, want);
        } else if (!have) {
            from.appendChild(want);
        } else if (k == null && keyOf(have) == null) {
            syncNode(have, want);
        } else {
            from.insertBefore(want, have);
        }
    });

    while (from.childNodes.length > next.length) from.lastChild.remove();
}

export function setHTML(el, html, { patch = false } = {}) {
    if (!el) return;

    if (!patch || !el.firstChild) {
        el.innerHTML = html;
        return;
    }

    const box = document.createElement("template");
    box.innerHTML = html;
    patchChildren(el, box.content);
}
