from odoo.exceptions import AccessError, UserError
from odoo.tests import tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon

# role -> model -> allowed operations (anything not listed must be refused)
EXPECTED = {
    'tech': {'itz.installation': 'rw', 'itz.task': 'rwc', 'stock.lot': 'r', 'itz.vehicle': 'r', 'res.partner': 'r', 'itz.device.event': 'r'},
    'sales': {'sale.order': 'rwc', 'itz.vehicle': 'rwc', 'itz.enquiry': 'rwc', 'itz.installation': 'rwc', 'itz.subscription': 'rwc', 'res.partner': 'rwc', 'stock.lot': 'r'},
    'accountant': {'account.move': 'rwcd', 'account.payment': 'rwcd', 'itz.subscription': 'rwc', 'res.partner': 'r', 'stock.lot': 'r'},
    'store': {'stock.lot': 'rwcd', 'product.template': 'rwc', 'purchase.order': 'rwcd', 'itz.task': 'rwc'},
    'support': {'res.partner': 'rwc', 'itz.vehicle': 'rwc', 'itz.subscription': 'rw', 'itz.installation': 'rwc', 'itz.enquiry': 'rwc'},
    'readonly': {'sale.order': 'r', 'account.move': 'r', 'stock.lot': 'r', 'itz.installation': 'r', 'itz.subscription': 'r', 'itz.task': 'r'},
}
MUST_NOT = {
    'tech': ['sale.order', 'account.move', 'account.payment', 'itz.subscription', 'itz.enquiry', 'hr.employee', 'itz.audit.log', 'purchase.order', 'itz.platform.config'],
    'sales': ['account.payment', 'hr.employee', 'itz.audit.log', 'purchase.order', 'itz.platform.config'],
    'accountant': ['hr.employee', 'itz.audit.log', 'itz.platform.config', 'itz.enquiry'],
    'store': ['account.payment', 'hr.employee', 'itz.audit.log', 'itz.enquiry', 'itz.platform.config'],
    'support': ['account.payment', 'account.move', 'purchase.order', 'hr.employee', 'itz.audit.log'],
    'readonly': ['hr.employee', 'itz.audit.log', 'itz.platform.config'],
}
OPS = (('read', 'r'), ('write', 'w'), ('create', 'c'), ('unlink', 'd'))


@tagged('post_install', '-at_install', 'itz')
class TestSecurityMatrix(ItzSalesCommon):

    def _allowed(self, user, model):
        out = ''
        for op, ch in OPS:
            try:
                self.env[model].with_user(user).check_access(op)
                out += ch
            except AccessError:
                pass
        return out

    def test_01_roles_have_at_least_the_expected_rights(self):
        for role, models in EXPECTED.items():
            for model, ops in models.items():
                got = self._allowed(self.users[role], model)
                for ch in ops:
                    self.assertIn(ch, got, '%s should have "%s" on %s but has "%s"' % (role, ch, model, got))

    def test_02_roles_have_no_rights_where_forbidden(self):
        for role, models in MUST_NOT.items():
            for model in models:
                got = self._allowed(self.users[role], model)
                self.assertEqual(got, '', '%s must not access %s but has "%s"' % (role, model, got))

    def test_03_readonly_role_cannot_change_anything(self):
        for model in ('sale.order', 'account.move', 'stock.lot', 'itz.installation', 'itz.subscription', 'itz.task', 'itz.vehicle', 'res.partner'):
            got = self._allowed(self.users['readonly'], model)
            self.assertEqual(got, 'r', '%s read-only role has "%s"' % (model, got))

    def test_04_storekeeper_sees_no_customer_invoices_and_cannot_edit_orders(self):
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.with_user(self.users['accountant']).action_post()
        self.assertEqual(self.env['account.move'].with_user(self.users['store']).search_count([('move_type', '=', 'out_invoice')]), 0)
        with self.assertRaises(AccessError):
            order.with_user(self.users['store']).write({'note': 'x'})
        self.assertTrue(order.with_user(self.users['store']).name)       # may still read it (delivery status)
        # the accountant and the operations manager still work normally
        self.assertEqual(self.env['account.move'].with_user(self.users['accountant']).search_count([('move_type', '=', 'out_invoice')]), 1)
        order.with_user(self.users['ops']).write({'note': 'ok'})

    def test_05_only_storekeeper_or_manager_moves_stock(self):
        supplier = self.env.ref('stock.stock_location_suppliers')
        picking = self.env['stock.picking'].create({
            'picking_type_id': self.warehouse.in_type_id.id, 'location_id': supplier.id, 'location_dest_id': self.stock_loc.id,
            'move_ids': [(0, 0, {'name': 'cable', 'product_id': self.cable.id, 'product_uom_qty': 5, 'product_uom': self.cable.uom_id.id,
                                 'location_id': supplier.id, 'location_dest_id': self.stock_loc.id})]})
        picking.action_confirm()
        picking.move_ids.quantity = 5
        picking.move_ids.picked = True
        for key in ('sales', 'accountant', 'support', 'readonly'):
            with self.assertRaises(UserError):
                picking.with_user(self.users[key]).button_validate()
        picking.with_user(self.users['store']).button_validate()
        self.assertEqual(picking.state, 'done')

    def test_06_scrap_and_adjustments_restricted(self):
        self.receive(self.cable, qty=10)
        scrap = self.env['stock.scrap'].create({'product_id': self.cable.id, 'scrap_qty': 1, 'location_id': self.stock_loc.id})
        with self.assertRaises(UserError):
            scrap.with_user(self.users['sales']).do_scrap()
        scrap.with_user(self.users['store']).do_scrap()
        self.assertEqual(scrap.state, 'done')

    def test_07_storekeeper_manages_catalogue_but_not_prices_of_others(self):
        prod = self.env['product.template'].with_user(self.users['store']).create({'name': 'Cable tie pack', 'itz_category': 'accessory', 'list_price': 1.0})
        self.assertTrue(prod.id)
        with self.assertRaises(AccessError):
            prod.with_user(self.users['store']).unlink()
        self.assertEqual(prod.with_user(self.users['sales']).list_price, 1.0)
        with self.assertRaises(AccessError):
            prod.with_user(self.users['sales']).write({'list_price': 2.0})

    def test_08_technician_cannot_read_sales_or_finance_through_installation(self):
        tech = self.users['tech']
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        job = order.itz_installation_ids
        job.with_user(self.users['ops']).write({'technician_id': tech.id})
        seen = job.with_user(tech)
        self.assertTrue(seen.name)
        with self.assertRaises(AccessError):
            seen.sale_order_id.name
        with self.assertRaises(AccessError):
            seen.read(['sale_order_id'])
        with self.assertRaises(AccessError):
            self.env['sale.order'].with_user(tech).search([])
        with self.assertRaises(AccessError):
            self.env['account.move'].with_user(tech).search([])

    def test_09_sensitive_fields_hidden(self):
        sim = self.env['stock.lot'].create({'name': '8925401000000000099', 'product_id': self.sim.id})
        sim.sudo().itz_sim_pin = '1234'
        self.assertEqual(sim.with_user(self.users['store']).itz_sim_pin, '1234')
        with self.assertRaises(AccessError):
            sim.with_user(self.users['sales']).read(['itz_sim_pin'])
        cfg = self.env['itz.platform.config'].get_config()
        cfg.sudo().api_key = 'secret'
        with self.assertRaises(AccessError):
            cfg.with_user(self.users['ops']).read(['api_key'])
        self.assertEqual(cfg.with_user(self.users['owner']).api_key, 'secret')
