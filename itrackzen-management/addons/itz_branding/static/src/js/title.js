/** @odoo-module **/
// The web client sets the tab title to "Odoo" when no action title exists. Show the ITrackZen name instead.
const BRAND = "ITrackZen Management";

function fixTitle() {
    if (document.title === "Odoo" || document.title.endsWith(" - Odoo")) {
        document.title = document.title.replace(/Odoo$/, BRAND);
    }
}

const titleEl = document.querySelector("title");
if (titleEl) {
    new MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
    fixTitle();
}
