# Helper for documentation: prints the real access matrix. Run from an odoo shell:  exec(open('.../dump_matrix.py').read())
ROLES = {'owner': 'itz_base.group_itz_owner', 'ops': 'itz_base.group_itz_ops_manager', 'sales': 'itz_base.group_itz_sales',
         'accountant': 'itz_base.group_itz_accountant', 'store': 'itz_base.group_itz_storekeeper', 'tech': 'itz_base.group_itz_technician',
         'support': 'itz_base.group_itz_support', 'readonly': 'itz_base.group_itz_readonly'}
MODELS = ['res.partner', 'itz.vehicle', 'itz.installation', 'itz.subscription', 'itz.task', 'itz.enquiry', 'sale.order', 'account.move', 'account.payment',
          'stock.lot', 'stock.quant', 'stock.picking', 'product.template', 'purchase.order', 'hr.employee', 'itz.audit.log', 'itz.platform.config',
          'itz.sync.job', 'itz.website.config', 'itz.report.wizard']
users = {}
for key, xmlid in ROLES.items():
    login = 'matrix_' + key
    u = env['res.users'].search([('login', '=', login)]) or env['res.users'].with_context(no_reset_password=True).create({
        'name': 'Matrix ' + key, 'login': login, 'groups_id': [(6, 0, [env.ref('base.group_user').id, env.ref(xmlid).id])]})
    users[key] = u
print('MATRIX model | ' + ' | '.join(ROLES))
for m in MODELS:
    row = []
    for key, u in users.items():
        cell = ''
        for op, ch in (('read', 'r'), ('write', 'w'), ('create', 'c'), ('unlink', 'd')):
            try:
                env[m].with_user(u).check_access(op)
                cell += ch
            except Exception:
                cell += '-'
        row.append(cell)
    print('MATRIX %s | %s' % (m, ' | '.join(row)))
env.cr.rollback()
