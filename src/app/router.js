const routes = {

    "/": {
        title: "Dashboard",
        module: "dashboard"
    },

    "/dashboard": {
        title: "Dashboard",
        module: "dashboard"
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

    "/stepup": {
        title: "StepUp",
        module: "stepup"
    },

    "/accounting": {
        title: "Accounting",
        module: "accounting"
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


export function getRoute() {

    const path = window.location.pathname;

    return routes[path] || {

        title: "Page Not Found",

        module: "404"

    };
}


export function navigate(path) {

    if (window.location.pathname === path) {

        window.dispatchEvent(
            new PopStateEvent("popstate")
        );

        return;
    }


    window.history.pushState(
        {},
        "",
        path
    );


    window.dispatchEvent(
        new PopStateEvent("popstate")
    );
}


export function initRouter(render) {

    window.addEventListener(
        "popstate",
        render
    );

}


/* Full page load that works on ANY static server.
   Reloading /dashboard directly 404s on servers without an SPA
   fallback, so we always reload index.html and pass the target
   route in ?go=  (index.html restores it before the app starts). */
export function hardNavigate(path) {
    const base = new URL("../../", import.meta.url);
    const target = path || (window.location.pathname + window.location.search);
    window.location.replace(new URL("index.html", base).href + "?go=" + encodeURIComponent(target));
}
