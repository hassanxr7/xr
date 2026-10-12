import { h, t } from './core.js';
import { dashboard } from './v_dash.js';
import { pos, visits, sales, repairs, quotes } from './v_sell.js';
import { inventory, transfers, purchases, devices } from './v_stock.js';
import { customers, suppliers, expenses, registers, payments, commissions, reports } from './v_money.js';
import { shop, scan, orders, labels } from './v_shop.js';
import { approvals, staff, roles, organisation, settings, audit, platform } from './v_admin.js';
export const views = { dashboard, shop, scan, orders, labels, quotes, pos, visits, sales, repairs, inventory, transfers, purchases, devices, customers, suppliers, expenses, registers, payments, commissions, reports, approvals, staff, roles, organisation, settings, audit, platform, notfound: () => h('div', { class: 'card empty' }, t('Not permitted')) };
