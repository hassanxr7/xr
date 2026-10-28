/** @odoo-module **/
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

// Light / dark appearance for the whole management system. The choice is remembered in this browser.
const KEY = "itz_theme";

export function currentTheme() {
    try { return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-itz-theme", theme);
    root.setAttribute("data-bs-theme", theme);
    root.style.colorScheme = theme;
}

export function setTheme(theme) {
    try { window.localStorage.setItem(KEY, theme); } catch { /* private mode: the choice just lasts for this page */ }
    applyTheme(theme);
    window.dispatchEvent(new CustomEvent("itz-theme-changed", { detail: theme }));
}

// apply as soon as the script loads to avoid a white flash
applyTheme(currentTheme());

export class ItzThemeToggle extends Component {
    static template = "itz_dashboard.ThemeToggle";
    static props = {};
    setup() { this.state = { theme: currentTheme() }; }
    get isDark() { return currentTheme() === "dark"; }
    get title() { return this.isDark ? _t("Switch to light mode") : _t("Switch to dark mode"); }
    toggle() {
        setTheme(this.isDark ? "light" : "dark");
        this.render();
    }
}

registry.category("systray").add("itz_theme_toggle", { Component: ItzThemeToggle }, { sequence: 3 });
