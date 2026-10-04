/* =========================================================
   BROKER REPORTS - on-demand libraries
   SheetJS (read Excel/CSV), jsPDF and jsPDF-AutoTable (PDF).
   Nothing here loads until the user opens a report reader.
   Each library tries a local copy in assets/vendor first
   (works offline) and falls back to a CDN, the same way the
   Accounting PDF export already loads jsPDF.
   ========================================================= */

const VENDOR = (file) =>
    new URL("../../../assets/vendor/" + file, import.meta.url).href;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            script.remove();
            reject(new Error("Could not load " + src));
        };
        document.head.appendChild(script);
    });
}

async function loadFirst(sources, isReady, label) {
    if (isReady()) return;

    for (const src of sources) {
        try {
            await loadScript(src);
            if (isReady()) return;
        } catch (e) { /* try the next source */ }
    }

    throw new Error(
        label + " could not be loaded. Check your internet connection and try again."
    );
}

export async function loadXlsx() {
    await loadFirst(
        [
            VENDOR("xlsx.full.min.js"),
            "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
            "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
        ],
        () => !!window.XLSX,
        "The Excel reader"
    );
    return window.XLSX;
}

export async function loadPdfLibs() {
    await loadFirst(
        [
            VENDOR("jspdf.umd.min.js"),
            "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
            "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
        ],
        () => !!(window.jspdf && window.jspdf.jsPDF),
        "The PDF engine"
    );

    const { jsPDF } = window.jspdf;

    if (typeof jsPDF.API.autoTable !== "function") {
        await loadFirst(
            [
                VENDOR("jspdf.plugin.autotable.min.js"),
                "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
                "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
            ],
            () => typeof jsPDF.API.autoTable === "function",
            "The PDF table engine"
        );
    }

    return jsPDF;
}
