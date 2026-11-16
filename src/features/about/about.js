import { icon } from "../../components/icons.js";

const SECTIONS = [
    {
        title: "Overview", icon: "layout-dashboard", color: "#3B82F6",
        items: [
            ["Dashboard", "Your whole financial picture at a glance"],
            ["Net Worth", "How your wealth has grown over time"],
            ["Connect Broker", "Link your broker account"],
            ["RoadSync", "Bring your statements and holdings in"]
        ]
    },
    {
        title: "Finance", icon: "wallet", color: "#22C55E",
        items: [
            ["Income Statement", "Track income and expenses"],
            ["Stocks", "Holdings, live prices and profit & loss"],
            ["Fixed Deposits", "Your deposits and maturities"],
            ["Lending", "Money you have lent or borrowed"],
            ["Mutual Fund", "SIPs and fund performance"]
        ]
    },
    {
        title: "Tools", icon: "calculator", color: "#14B8A6",
        items: [
            ["Calculators", "Plan investments and loans"],
            ["Accounting", "Keep your books in order"],
            ["Brokerage Report Readers", "Read broker reports into BlackRoad"],
            ["Data Management", "Back up, restore and manage your data"],
            ["Notifications", "Alerts and due reminders"]
        ]
    }
];

export async function About() {
    const page = document.createElement("section");
    page.className = "br-page";

    page.innerHTML = `
        <div class="br-page-heading">
            <div>
                <h2>About BlackRoad</h2>
                <p>A road to your financial wealth</p>
            </div>
        </div>

        <section class="br-card ab-hero">
            <div class="br-brand-logo" aria-hidden="true"></div>
            <div>
                <h3>BlackRoad Finance</h3>
                <p class="ab-text">BlackRoad is a personal finance app that brings your money into one place, so you can see where you stand and where you are heading.</p>
            </div>
        </section>

        <div class="br-grid br-grid-3">
            ${SECTIONS.map((s) => `
                <section class="br-card ab-card">
                    <h3><span class="ab-ico" style="--ab-color:${s.color}">${icon(s.icon, { size: 18 })}</span>${s.title}</h3>
                    <ul class="ab-list">
                        ${s.items.map(([name, text]) => `<li><strong>${name}</strong><span>${text}</span></li>`).join("")}
                    </ul>
                </section>`).join("")}
        </div>

        <div class="br-grid br-grid-2">
            <section class="br-card ab-card">
                <h3><span class="ab-ico" style="--ab-color:#D4AF37">${icon("sparkles", { size: 18 })}</span>Rover</h3>
                <p class="ab-text">Rover is the built-in assistant. It answers from your own data on this device. It is a financial intelligence bot and can make mistakes, so double-check it.</p>
            </section>
            <section class="br-card ab-card">
                <h3><span class="ab-ico" style="--ab-color:#10B981">${icon("database", { size: 18 })}</span>Your data</h3>
                <p class="ab-text">Your data stays on your device.</p>
            </section>
        </div>

        <p class="ab-credit">Developed by <strong>Microintel</strong></p>
    `;

    return page;
}
