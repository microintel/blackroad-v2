import { navigation } from "../../app/navigation.js";
import { navigate } from "../../app/router.js";


export function Sidebar() {

    const sidebar = document.createElement("aside");

    sidebar.className = "br-sidebar";


    sidebar.innerHTML = `

        <div class="br-brand">

            <div class="br-brand-logo">
                B
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


            link.href = item.path;

            link.className = "br-nav-item";

            const here = window.location.pathname === "/" ? "/dashboard" : window.location.pathname;

            if (here === item.path) {
                link.classList.add("is-active");
                link.setAttribute("aria-current", "page");
            }


            link.innerHTML = `

                <span class="br-nav-icon">
                    ${item.icon}
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


            sectionElement.appendChild(link);

        });


        nav.appendChild(sectionElement);

    });


    return sidebar;
}