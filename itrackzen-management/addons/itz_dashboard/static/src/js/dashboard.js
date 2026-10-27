/** @odoo-module **/
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

export class ItzDashboard extends Component {
    static template = "itz_dashboard.Main";
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ loading: true, data: null, query: "", results: null, searching: false, showFigures: false });
        this._timer = null;
        onWillStart(async () => {
            await this.load();
        });
    }

    async load() {
        this.state.loading = true;
        this.state.data = await this.orm.call("itz.dashboard", "get_data", []);
        this.state.loading = false;
    }

    get greeting() {
        const h = new Date().getHours();
        const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
        return `${part}, ${this.state.data.user.name.split(" ")[0]}`;
    }

    formatValue(tile) {
        if (tile.money) {
            const c = this.state.data.currency;
            const n = Number(tile.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            return c.position === "before" ? `${c.symbol} ${n}` : `${n} ${c.symbol}`;
        }
        return tile.value;
    }

    openTile(tile) {
        if (tile.res_model) {
            this.action.doAction({
                type: "ir.actions.act_window",
                name: tile.label,
                res_model: tile.res_model,
                views: [[false, "list"], [false, "form"]],
                domain: tile.domain || [],
                target: "current",
            });
        }
    }

    openQuick(item) {
        if (item.kind === "new") {
            this.action.doAction({
                type: "ir.actions.act_window",
                name: item.label,
                res_model: item.model,
                views: [[false, "form"]],
                target: "current",
                context: item.context || {},
            });
        } else {
            this.action.doAction(item.action);
        }
    }

    openAttention(item) {
        this.openTile({ label: item.label, res_model: item.res_model, domain: item.domain });
    }

    toggleFigures() {
        this.state.showFigures = !this.state.showFigures;
    }

    get today() {
        return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    }

    openRecord(model, id) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: model,
            res_id: id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    openReports() {
        this.action.doAction("itz_dashboard.action_itz_reports");
    }

    onSearchInput(ev) {
        this.state.query = ev.target.value;
        clearTimeout(this._timer);
        if (this.state.query.trim().length < 2) {
            this.state.results = null;
            return;
        }
        this._timer = setTimeout(async () => {
            this.state.searching = true;
            this.state.results = await this.orm.call("itz.dashboard", "search_global", [this.state.query]);
            this.state.searching = false;
        }, 250);
    }

    clearSearch() {
        this.state.query = "";
        this.state.results = null;
    }
}

registry.category("actions").add("itz_dashboard", ItzDashboard);
