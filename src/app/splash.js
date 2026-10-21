/* =========================================================
   BlackRoad splash controller (classic script, no imports).
   - Plays the full animation once per session.
   - The app opens only AFTER the animation has fully finished: it waits
     for the last animation (the loading bar) to fire `animationend`, so
     a slow device can never cut it short. It also waits for the app to
     have drawn its first screen, so it never reveals a blank page.
   - A long safety timeout exists only so a broken animation can't trap
     the user on the splash.
   - Everything it needs is in the cached app shell, so it works offline.
   ========================================================= */
(function () {
    var el = document.getElementById("br-splash");
    if (!el) return;

    var root = document.documentElement;

    /* Already shown this session: remove it outright. */
    if (root.classList.contains("br-splash-skip")) {
        el.parentNode.removeChild(el);
        return;
    }

    var HOLD_MS = 350;       /* let the completed loading bar be seen */
    var SAFETY_MS = 15000;   /* only if the animation never reports completion */
    var animationDone = false;
    var leaving = false;

    function appReady() {
        var app = document.getElementById("app");
        return !!(app && app.children.length);
    }

    function leave() {
        if (leaving) return;
        leaving = true;
        try { sessionStorage.setItem("br-splash", "1"); } catch (e) { /* ignore */ }
        el.classList.add("is-leaving");
        var remove = function () { if (el.parentNode) el.parentNode.removeChild(el); };
        el.addEventListener("transitionend", remove, { once: true });
        setTimeout(remove, 900);
    }

    /* Animation finished: now open the app as soon as it is ready. */
    function waitForApp() {
        if (leaving) return;
        if (appReady()) leave();
        else setTimeout(waitForApp, 80);
    }

    function onAnimationComplete() {
        if (animationDone) return;
        animationDone = true;
        setTimeout(waitForApp, HOLD_MS);
    }

    /* The loading bar is the last thing to animate (ends ~4.0s). */
    el.addEventListener("animationend", function (e) {
        if (e.animationName === "brsp-load") onAnimationComplete();
    });

    /* Safety net only. */
    setTimeout(function () {
        if (!animationDone) onAnimationComplete();
    }, SAFETY_MS);
})();
