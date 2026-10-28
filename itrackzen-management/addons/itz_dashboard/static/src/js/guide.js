/** @odoo-module **/
import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { GUIDE, UI } from "./guide_data";

const LANG_KEY = "itz_guide_lang";

function savedLang() {
    try { return window.localStorage.getItem(LANG_KEY) === "so" ? "so" : "en"; } catch { return "en"; }
}

/** Step-by-step lessons with pictures, readable in English or Somali. */
export class ItzGuide extends Component {
    static template = "itz_dashboard.Guide";
    static props = { ...standardActionServiceProps };

    setup() {
        this.action = useService("action");
        this.state = useState({ lang: savedLang(), topic: GUIDE[0].id, query: "" });
    }
    get ui() { return UI[this.state.lang]; }
    get topics() {
        const q = this.state.query.trim().toLowerCase();
        if (!q) { return GUIDE; }
        return GUIDE.filter((t) => JSON.stringify([t.title, t.intro, t.steps, t.tip]).toLowerCase().includes(q));
    }
    get current() { return GUIDE.find((t) => t.id === this.state.topic) || GUIDE[0]; }
    get next() {
        const i = GUIDE.indexOf(this.current);
        return GUIDE[i + 1];
    }
    tr(obj) { return obj[this.state.lang] || obj.en; }
    image(topic) { return `/itz_dashboard/static/src/img/guide/${topic.img}`; }
    toggleLang() {
        this.state.lang = this.state.lang === "en" ? "so" : "en";
        try { window.localStorage.setItem(LANG_KEY, this.state.lang); } catch { /* remembered for this page only */ }
    }
    open(id) { this.state.topic = id; }
    backToDashboard() { this.action.doAction("itz_dashboard.action_itz_dashboard"); }
}

registry.category("actions").add("itz_guide", ItzGuide);
