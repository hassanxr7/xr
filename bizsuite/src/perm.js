// Permission catalogue: "<module>.<action>". Roles are data (configurable); these are only defaults/templates.
export const ACTIONS = ['view', 'create', 'edit', 'approve', 'refund', 'void', 'export', 'print', 'settings'];
export const MODULES = ['dashboard', 'sales', 'purchases', 'inventory', 'products', 'devices', 'customers', 'suppliers', 'expenses', 'repairs',
  'services', 'commissions', 'payouts', 'registers', 'payments', 'reports', 'staff', 'roles', 'branches', 'approvals', 'audit', 'settings'];
// Extra sensitivity flags (not CRUD): cost.view, profit.view, commissions.viewall, services.viewall, repairs.viewall, sales.viewall
export const SPECIAL = ['cost.view', 'profit.view', 'commissions.viewall', 'services.viewall', 'repairs.viewall', 'sales.viewall', 'services.record_any'];
export const ALL_PERMS = [...MODULES.flatMap((m) => ACTIONS.map((a) => `${m}.${a}`)), ...SPECIAL];

const p = (m, ...a) => a.map((x) => `${m}.${x}`);
export const DEFAULT_ROLES = {
  Owner: { scope: 'org', perms: ALL_PERMS, limits: {}, is_system: 1 },
  'Branch Manager': {
    scope: 'assigned', limits: { discount_bp: 2000, refund_max: 100000, expense_max: 50000, adjust_qty: 50, payout_max: 200000 },
    perms: [...p('dashboard', 'view'), ...p('sales', 'view', 'create', 'refund', 'void', 'approve', 'print', 'export'), ...p('purchases', 'view', 'create', 'edit', 'approve'),
      ...p('inventory', 'view', 'create', 'edit', 'approve', 'export'), ...p('products', 'view', 'create', 'edit'), ...p('devices', 'view', 'create', 'edit'),
      ...p('customers', 'view', 'create', 'edit'), ...p('suppliers', 'view', 'create', 'edit'), ...p('expenses', 'view', 'create', 'approve', 'export'),
      ...p('repairs', 'view', 'create', 'edit', 'approve', 'print'), ...p('services', 'view', 'create', 'refund', 'void', 'approve', 'print'),
      ...p('commissions', 'view'), ...p('payouts', 'view', 'create', 'approve'), ...p('registers', 'view', 'create', 'edit', 'approve'),
      ...p('payments', 'view', 'create'), ...p('reports', 'view', 'export', 'print'), ...p('staff', 'view'), ...p('approvals', 'view', 'approve'),
      'cost.view', 'profit.view', 'commissions.viewall', 'services.viewall', 'repairs.viewall', 'sales.viewall', 'services.record_any'],
  },
  Cashier: {
    scope: 'assigned', limits: { discount_bp: 500, refund_max: 0, expense_max: 0, adjust_qty: 0 },
    perms: [...p('sales', 'view', 'create', 'print'), ...p('customers', 'view', 'create'), ...p('products', 'view'), ...p('inventory', 'view'), ...p('registers', 'view', 'create'),
      ...p('payments', 'view', 'create'), ...p('services', 'view', 'create', 'print'), ...p('repairs', 'view', 'create', 'edit', 'print'), ...p('devices', 'view'), 'services.record_any'],
  },
  Technician: {
    scope: 'assigned', limits: {},
    perms: [...p('repairs', 'view', 'edit', 'print'), ...p('products', 'view'), ...p('inventory', 'view'), ...p('commissions', 'view')],
  },
  Barber: {
    scope: 'assigned', limits: {},
    perms: [...p('services', 'view'), ...p('commissions', 'view'), ...p('dashboard', 'view')], // own data only; add services.create to let a barber record their own services
  },
  Accountant: {
    scope: 'org', limits: { expense_max: 0 },
    perms: [...p('dashboard', 'view'), ...p('expenses', 'view', 'create', 'approve', 'export'), ...p('customers', 'view'), ...p('suppliers', 'view'), ...p('payments', 'view', 'create', 'export'),
      ...p('payouts', 'view', 'create', 'export'), ...p('commissions', 'view', 'export'), ...p('reports', 'view', 'export', 'print'), ...p('registers', 'view'),
      ...p('sales', 'view', 'export'), ...p('purchases', 'view', 'export'), 'cost.view', 'profit.view', 'commissions.viewall', 'sales.viewall', 'services.viewall'],
  },
};
export const BUSINESS_TYPES = ['clothing', 'electronics_retail', 'electronics_repair', 'barber', 'electronics_combined'];
const COMMON = ['customers', 'suppliers', 'expenses', 'registers', 'reports', 'payments'];
export const TYPE_MODULES = {
  clothing: [...COMMON, 'sales', 'purchases', 'inventory', 'products'],
  electronics_retail: [...COMMON, 'sales', 'purchases', 'inventory', 'products', 'devices'],
  electronics_repair: [...COMMON, 'repairs', 'purchases', 'inventory', 'products'],
  barber: [...COMMON, 'services', 'commissions', 'payouts'],
  electronics_combined: [...COMMON, 'sales', 'purchases', 'inventory', 'products', 'devices', 'repairs'],
};
