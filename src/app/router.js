const routes = {

    "/": {
        title: "Dashboard",
        module: "dashboard"
    },

    "/dashboard": {
        title: "Dashboard",
        module: "dashboard"
    },

    "/networth": {
        title: "Net Worth Evolution",
        module: "networth"
    },

    "/income": {
        title: "Income & Expenses",
        module: "income"
    },

    "/stocks": {
        title: "Stocks",
        module: "stocks"
    },

    "/deposits": {
        title: "Fixed Deposits",
        module: "deposits"
    },

    "/lending": {
        title: "Lending",
        module: "lending"
    },

    "/mutualfund": {
        title: "Mutual Fund",
        module: "stepup"
    },

    /* old StepUp address, kept so bookmarks keep working */
    "/stepup": {
        title: "Mutual Fund",
        module: "stepup"
    },

    "/intelligence": {
        title: "Financial Intelligence",
        module: "intelligence"
    },

    "/calculators": {
        title: "Calculators",
        module: "calculators"
    },

    "/accounting": {
        title: "Accounting",
        module: "accounting"
    },

    "/connect-broker": {
        title: "Connect Broker",
        module: "connectbroker"
    },

    "/brokers": {
        title: "Brokerage Report Readers",
        module: "brokers"
    },

    "/data": {
        title: "Data Management",
        module: "data"
    },

    "/notifications": {
        title: "Notifications",
        module: "notifications"
    },

    "/account": {
        title: "Account",
        module: "account"
    },

    "/login": {
        title: "Sign in",
        module: "login"
    },

    "/register": {
        title: "Create account",
        module: "register"
    }

};


/* =========================================================
   HASH ROUTING
   URLs look like  index.html#/income.  The server only ever has
   to serve index.html, so reloading, bookmarking, resizing the
   window / toggling device mode, or hosting on any static server
   (Live Server, python -m http.server, GitHub Pages, ...) never
   produces a 404. Old path-style URLs (/income) are converted to
   the hash form by the inline script in index.html.
   ========================================================= */

/* The current route path, e.g. "/income" ("/" when there is none). */
export function currentPath() {
    const raw = window.location.hash.replace(/^#/, "").split("?")[0];
    return raw.charAt(0) === "/" ? raw : "/";
}

/* href for a route, for <a> tags. */
export function hrefFor(path) {
    return "#" + path;
}

/* The route definition for a path, or undefined. */
export function routeFor(path) {
    return routes[path];
}

export function getRoute() {

    return routes[currentPath()] || {

        title: "Page Not Found",

        module: "404"

    };
}


export function navigate(path) {

    if (currentPath() === path) {

        window.dispatchEvent(
            new PopStateEvent("popstate")
        );

        return;
    }


    window.history.pushState(
        {},
        "",
        hrefFor(path)
    );


    window.dispatchEvent(
        new PopStateEvent("popstate")
    );

}


/* Change the route without adding a history entry, and without rendering. */
export function replaceRoute(path) {
    window.history.replaceState({}, "", hrefFor(path));
}


export function initRouter(render) {

    window.addEventListener(
        "popstate",
        render
    );

}


/* Full page load (sign-in / sign-out / restore, where the data layer must
   start fresh). Reloads index.html with the target route in the hash; the
   throwaway ?_= value forces a real reload even if only the hash differs. */
export function hardNavigate(path) {
    const base = new URL("../../", import.meta.url);
    const target = path || currentPath();
    window.location.replace(
        new URL("index.html", base).href + "?_=" + Date.now() + "#" + target
    );
}
