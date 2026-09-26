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

    "/notifications": {
        title: "Notifications",
        module: "notifications"
    },

    "/account": {
        title: "Account",
        module: "account"
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