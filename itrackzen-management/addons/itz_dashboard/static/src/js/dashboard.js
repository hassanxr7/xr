/** @odoo-module **/
import { Component, onMounted, onWillStart, onWillUnmount, onWillUpdateProps, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

function money(value, c) {
    const n = Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return c.position === "before" ? `${c.symbol} ${n}` : `${n} ${c.symbol}`;
}

export function fmtMinutes(m) {
    m = Math.max(0, Math.round(m || 0));
    const h = Math.floor(m / 60);
    return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** A number that counts up to its value when it appears or changes. */
export class CountUp extends Component {
    static template = "itz_dashboard.CountUp";
    static props = { value: Number, currency: { type: Object, optional: true }, money: { type: Boolean, optional: true } };
    setup() {
        this.state = useState({ shown: 0 });
        this.frame = null;
        onMounted(() => this.animate(0, this.props.value));
        onWillUpdateProps((next) => { if (next.value !== this.props.value) { this.animate(this.state.shown, next.value); } });
        onWillUnmount(() => cancelAnimationFrame(this.frame));
    }
    animate(from, to) {
        cancelAnimationFrame(this.frame);
        const start = performance.now(), duration = 700;
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
            this.state.shown = from + (to - from) * eased;
            if (t < 1) { this.frame = requestAnimationFrame(step); } else { this.state.shown = to; }
        };
        this.frame = requestAnimationFrame(step);
    }
    get text() {
        const v = this.state.shown;
        return this.props.money && this.props.currency ? money(v, this.props.currency) : String(Math.round(v));
    }
}

export class ItzDashboard extends Component {
    static template = "itz_dashboard.Main";
    static components = { CountUp };
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.searchInput = useRef("searchInput");
        this.state = useState({ loading: true, data: null, query: "", results: null, searching: false, showFigures: false, now: new Date(), refreshedAt: null });
        this._timer = null;
        onWillStart(async () => { await this.load(); });
        onMounted(() => {
            this._clock = setInterval(() => { this.state.now = new Date(); }, 30000);
            this._refresh = setInterval(() => { if (document.visibilityState === "visible" && !this.state.query) { this.load(true); } }, 60000);
            this._key = (ev) => {
                if (ev.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
                    ev.preventDefault();
                    this.searchInput.el?.focus();
                }
            };
            window.addEventListener("keydown", this._key);
        });
        onWillUnmount(() => { clearInterval(this._clock); clearInterval(this._refresh); window.removeEventListener("keydown", this._key); });
    }

    async load(silent = false) {
        if (!silent) { this.state.loading = true; }
        this.state.data = await this.orm.call("itz.dashboard", "get_data", []);
        this.state.refreshedAt = new Date();
        this.state.loading = false;
    }

    get hour() { return this.state.now.getHours(); }
    get greeting() {
        const part = this.hour < 12 ? "Good morning" : this.hour < 18 ? "Good afternoon" : "Good evening";
        return `${part}, ${this.state.data.user.name.split(" ")[0]}`;
    }
    get dayIcon() { return this.hour >= 18 || this.hour < 5 ? "fa-moon-o" : "fa-sun-o"; }
    get today() { return this.state.now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); }
    get clock() { return this.state.now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }

    get tilesByKey() {
        const out = {};
        for (const sec of this.state.data.sections) { for (const t of sec.tiles) { out[t.key] = t; } }
        return out;
    }
    get kpis() { return this.state.data.kpis.map((k) => this.tilesByKey[k]).filter(Boolean); }

    formatValue(tile) { return tile.money ? money(tile.value, this.state.data.currency) : tile.value; }
    minutes(m) { return fmtMinutes(m); }
    dayPercent(m) { return Math.min(100, Math.round((m / 480) * 100)); }
    shortTime(utc) {
        if (!utc) { return "-"; }
        return new Date(utc.replace(" ", "T") + "Z").toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    /** Points for a small line chart of the last 7 days. */
    spark(key) {
        const v = this.state.data.trends[key];
        if (!v || !v.length) { return null; }
        const w = 120, h = 36, max = Math.max(...v, 1), step = w / (v.length - 1);
        const pts = v.map((y, i) => `${(i * step).toFixed(1)},${(h - 3 - (y / max) * (h - 8)).toFixed(1)}`);
        return { line: pts.join(" "), area: `0,${h} ${pts.join(" ")} ${w},${h}`, total: v.reduce((a, b) => a + b, 0), w, h };
    }

    openTile(tile) {
        if (tile.res_model) {
            this.action.doAction({ type: "ir.actions.act_window", name: tile.label, res_model: tile.res_model, views: [[false, "list"], [false, "form"]], domain: tile.domain || [], target: "current" });
        }
    }
    openQuick(item) {
        if (item.kind === "new") {
            this.action.doAction({ type: "ir.actions.act_window", name: item.label, res_model: item.model, views: [[false, "form"]], target: "current", context: item.context || {} });
        } else {
            this.action.doAction(item.action);
        }
    }
    openAttention(item) { this.openTile({ label: item.label, res_model: item.res_model, domain: item.domain }); }
    openGuide() { this.action.doAction("itz_dashboard.action_itz_guide"); }
    openHours() { this.action.doAction("itz_dashboard.action_itz_presence"); }
    toggleFigures() { this.state.showFigures = !this.state.showFigures; }
    openRecord(model, id) { this.action.doAction({ type: "ir.actions.act_window", res_model: model, res_id: id, views: [[false, "form"]], target: "current" }); }

    onSearchInput(ev) {
        this.state.query = ev.target.value;
        clearTimeout(this._timer);
        if (this.state.query.trim().length < 2) { this.state.results = null; return; }
        this._timer = setTimeout(async () => {
            this.state.searching = true;
            this.state.results = await this.orm.call("itz.dashboard", "search_global", [this.state.query]);
            this.state.searching = false;
        }, 250);
    }
    clearSearch() { this.state.query = ""; this.state.results = null; }
}

registry.category("actions").add("itz_dashboard", ItzDashboard);
