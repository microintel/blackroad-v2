export function Topbar(title) {

    return `

        <header class="br-header">

            <div class="br-header-left">

                <button
                    class="br-mobile-menu"
                    type="button"
                    aria-label="Open navigation"
                >
                    ☰
                </button>


                <div>

                    <h1 class="br-page-title">
                        ${title}
                    </h1>

                </div>

            </div>


            <div class="br-header-actions">

                <button
                    class="br-icon-button"
                    type="button"
                    aria-label="Search"
                >
                    ⌕
                </button>


                <button
                    class="br-icon-button"
                    type="button"
                    aria-label="Notifications"
                >
                    ♢
                </button>


                <button
                    class="br-account-button"
                    type="button"
                >
                    Account
                </button>

            </div>

        </header>

    `;
}