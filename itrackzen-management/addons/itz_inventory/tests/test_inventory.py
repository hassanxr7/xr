from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged
from .common import ItzCommon


@tagged('post_install', '-at_install', 'itz')
class TestInventory(ItzCommon):

    def test_01_receive_creates_devices_available(self):
        self.receive(self.tracker, ['356307042441013', '356307042441021'])
        lots = self.env['stock.lot'].search([('product_id', '=', self.tracker.id)])
        self.assertEqual(len(lots), 2)
        self.assertTrue(all(l.itz_state == 'available' for l in lots))
        self.assertEqual(lots.mapped('itz_imei').sort() or True, True)
        self.assertEqual(set(lots.mapped('itz_imei')), {'356307042441013', '356307042441021'})
        self.assertEqual(self.tracker.product_tmpl_id.itz_available_qty, 2)
        self.assertTrue(lots[0].itz_supplier_id)

    def test_02_duplicate_imei_and_serial_blocked(self):
        self.receive(self.tracker, ['356307042441013'])
        with self.assertRaises(ValidationError):
            self.env['stock.lot'].create({'name': '356307042441013', 'product_id': self.tracker.id})
        other = self.env['product.product'].create({'name': 'Tracker Y2', 'itz_category': 'tracker'})
        with self.assertRaises(ValidationError):
            self.env['stock.lot'].create({'name': '356307042441013', 'product_id': other.id})
        with self.assertRaises(ValidationError):
            self.env['stock.lot'].create({'name': 'A1', 'itz_imei': 'ABC', 'product_id': other.id})

    def test_03_issue_and_return_to_technician(self):
        self.receive(self.tracker, ['356307042441013'])
        lot = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        tech = self.users['tech']
        wiz = self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id,
            'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': lot.id, 'quantity': 1})],
        })
        wiz.action_confirm()
        lot.invalidate_recordset()
        self.assertEqual(lot.itz_state, 'issued')
        self.assertEqual(lot.itz_technician_user_id, tech)
        self.assertEqual(lot.itz_location_id, tech.employee_id.itz_stock_location_id)
        # cannot be issued twice
        with self.assertRaises(UserError):
            self.env['itz.issue.technician'].with_user(self.users['store']).create({
                'technician_id': tech.id,
                'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': lot.id, 'quantity': 1})]}).action_confirm()
        # return
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'mode': 'return', 'technician_id': tech.id,
            'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': lot.id, 'quantity': 1})]}).action_confirm()
        lot.invalidate_recordset()
        self.assertEqual(lot.itz_state, 'returned')
        lot.with_user(self.users['store']).action_mark_available()
        self.assertEqual(lot.itz_state, 'available')
        self.assertTrue(lot.itz_event_ids)

    def test_04_only_storekeeper_issues_stock(self):
        self.receive(self.tracker, ['356307042441013'])
        lot = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        with self.assertRaises(AccessError):
            self.env['itz.issue.technician'].with_user(self.users['sales']).create({
                'technician_id': self.users['tech'].id,
                'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': lot.id, 'quantity': 1})]}).action_confirm()
        with self.assertRaises(UserError):
            lot.with_user(self.users['sales']).action_mark_available()

    def test_05_technician_sees_only_own_equipment(self):
        self.receive(self.tracker, ['356307042441013', '356307042441021'])
        lots = self.env['stock.lot'].search([('product_id', '=', self.tracker.id)], order='id')
        for lot, key in zip(lots, ('tech', 'tech2')):
            self.env['itz.issue.technician'].with_user(self.users['store']).create({
                'technician_id': self.users[key].id,
                'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': lot.id, 'quantity': 1})]}).action_confirm()
        seen = self.env['stock.lot'].with_user(self.users['tech']).search([('product_id', '=', self.tracker.id)])
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen.itz_technician_user_id, self.users['tech'])
        quants = self.env['stock.quant'].with_user(self.users['tech']).search([('product_id', '=', self.tracker.id)])
        self.assertTrue(quants)
        self.assertTrue(all(q.location_id.itz_technician_user_id == self.users['tech'] for q in quants))
        # staff see everything
        allseen = self.env['stock.lot'].with_user(self.users['store']).search([('product_id', '=', self.tracker.id)])
        self.assertEqual(len(allseen), 2)
        with self.assertRaises(AccessError):
            seen.with_user(self.users['tech']).write({'name': 'hack'})

    def test_06_cost_hidden_from_non_financial(self):
        tmpl = self.tracker.product_tmpl_id
        self.assertEqual(tmpl.with_user(self.users['store']).standard_price, 55.0)
        with self.assertRaises(AccessError):
            tmpl.with_user(self.users['tech']).read(['standard_price'])
        with self.assertRaises(AccessError):
            tmpl.with_user(self.users['sales']).read(['standard_price'])
        self.assertEqual(tmpl.with_user(self.users['sales']).list_price, 90.0)

    def test_07_adjustment_needs_manager_and_is_logged(self):
        quant = self.env['stock.quant'].with_context(inventory_mode=True).create({
            'product_id': self.cable.id, 'location_id': self.stock_loc.id, 'inventory_quantity': 10})
        with self.assertRaises(UserError):
            quant.with_user(self.users['store']).with_context(inventory_mode=True).action_apply_inventory()
        quant.with_user(self.users['ops']).with_context(inventory_mode=True).action_apply_inventory()
        log = self.env['itz.audit.log'].search([('action', '=', 'Stock adjustment')])
        self.assertTrue(log)

    def test_08_low_stock_alert(self):
        self.receive(self.tracker, ['356307042441013'])
        self.tracker.product_tmpl_id.invalidate_recordset()
        self.assertTrue(self.tracker.product_tmpl_id.itz_low_stock)
        self.env['product.template']._itz_cron_low_stock()
        act = self.env['mail.activity'].search([('res_model', '=', 'product.template'), ('res_id', '=', self.tracker.product_tmpl_id.id), ('summary', '=', 'Low stock')])
        self.assertTrue(act)

    def test_09_audit_log_append_only(self):
        entry = self.env['itz.audit.log'].log('other', 'test')
        with self.assertRaises(UserError):
            entry.write({'action': 'x'})
        with self.assertRaises(UserError):
            entry.unlink()

    def test_10_lot_with_history_cannot_be_deleted(self):
        self.receive(self.tracker, ['356307042441013'])
        lot = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        with self.assertRaises(UserError):
            lot.unlink()
