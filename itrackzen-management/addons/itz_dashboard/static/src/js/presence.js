/** @odoo-module **/
import { registry } from "@web/core/registry";

// Sends a small "I am here" signal once a minute while the page is open and the person has used the mouse or keyboard
// in the last five minutes. The server turns the signals into hours online (see itz.presence).
const PING_EVERY = 60 * 1000;
const IDLE_AFTER = 5 * 60 * 1000;

export const itzPresenceService = {
    dependencies: ["orm"],
    start(env, { orm }) {
        let lastActivity = Date.now();
        const touch = () => { lastActivity = Date.now(); };
        for (const name of ["mousemove", "keydown", "click", "scroll", "touchstart"]) {
            window.addEventListener(name, touch, { passive: true });
        }
        const ping = () => {
            if (document.visibilityState === "visible" && Date.now() - lastActivity < IDLE_AFTER) {
                orm.silent.call("itz.presence", "ping", []).catch(() => {});
            }
        };
        setTimeout(ping, 3000);
        setInterval(ping, PING_EVERY);
        return {};
    },
};
registry.category("services").add("itz_presence", itzPresenceService);
