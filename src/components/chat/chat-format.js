/* Text helpers for the chat components. Everything is escaped first. */

export const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/*
 * Rover's replies are plain text. Lines written as "• Label: value" become
 * a tidy label / value list; everything else stays as paragraphs.
 */
export function richText(text) {
    const out = [];
    let rows = [];
    const flush = () => {
        if (rows.length) out.push(`<dl class="rv-rows">${rows.join("")}</dl>`);
        rows = [];
    };

    String(text).split("\n").forEach((line) => {
        const m = line.match(/^•\s*([^:]+):\s*(.+)$/);
        if (m) rows.push(`<div><dt>${bold(m[1])}</dt><dd>${bold(m[2])}</dd></div>`);
        else if (line.startsWith("• ")) rows.push(`<div class="is-wide"><dt>${bold(line.slice(2))}</dt></div>`);
        else {
            flush();
            if (line.trim()) out.push(`<p>${bold(line)}</p>`);
        }
    });
    flush();
    return out.join("");
}

export function greeting(date = new Date()) {
    const h = date.getHours();
    return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Hello";
}
