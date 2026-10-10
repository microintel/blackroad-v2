import { navigation } from "../../app/navigation.js";
import { navigate, currentPath, hrefFor } from "../../app/router.js";
import { icon } from "../icons.js";
import { BROKER_EVENT, isAngelConnected } from "../../services/angel-session.js";


export function Sidebar() {

    const sidebar = document.createElement("aside");

    sidebar.className = "br-sidebar";


    sidebar.innerHTML = `

        <div class="br-brand">

            <div class="br-brand-logo" aria-hidden="true">
                BR
            </div>

            <div>

                <div class="br-brand-name">
                    BlackRoad
                </div>

                <div class="br-brand-subtitle">
                    Finance
                </div>

            </div>

        </div>


        <nav
            class="br-sidebar-nav"
            aria-label="Main navigation"
        ></nav>

        <div class="br-sidebar-credit">
            Developed by <strong>Microintel</strong>
        </div>

    `;


    const nav = sidebar.querySelector(
        ".br-sidebar-nav"
    );


    navigation.forEach((section) => {

        const sectionElement =
            document.createElement("div");


        sectionElement.className =
            "br-nav-section";


        sectionElement.innerHTML = `

            <div class="br-nav-section-title">
                ${section.title}
            </div>

        `;


        section.items.forEach((item) => {

            const link =
                document.createElement("a");


            link.href = hrefFor(item.path);

            link.className = "br-nav-item";

            const here = currentPath() === "/" ? "/dashboard" : currentPath();

            if (here === item.path) {
                link.classList.add("is-active");
                link.setAttribute("aria-current", "page");
            }


            link.innerHTML = `

                <span class="br-nav-icon"${item.color ? ` style="--nav-color:${item.color}"` : ""}>
                    ${icon(item.icon, { size: 20 })}
                </span>

                <span class="br-nav-label">
                    ${item.label}
                </span>

            `;


            link.addEventListener(
                "click",
                (event) => {

                    event.preventDefault();

                    navigate(item.path);

                }
            );


            // "Connected" label on Connect Broker while a broker is linked.
            if (item.path === "/connect-broker") {
                const tag = document.createElement("span");

                tag.className = "br-nav-connected";
                tag.title = "Connected";
                tag.setAttribute("role", "img");
                tag.setAttribute("aria-label", "Connected");
                link.appendChild(tag);

                let seen = false;

                const sync = () => {
                    if (link.isConnected) seen = true;
                    else if (seen) {
                        window.removeEventListener(BROKER_EVENT, sync);
                        return;
                    }

                    tag.hidden = !isAngelConnected();
                };

                window.addEventListener(BROKER_EVENT, sync);
                sync();
            }

            sectionElement.appendChild(link);

        });


        nav.appendChild(sectionElement);

    });


    return sidebar;
}