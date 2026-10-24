from odoo import fields
from odoo.exceptions import AccessError, UserError
from odoo.tests import tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon


@tagged('post_install', '-at_install', 'itz')
class TestSalesFlow(ItzSalesCommon):

    def test_01_approval_required_and_four_eyes(self):
        order = self.make_quote(qty=10)       # 10 x (90 + 25) + 10 > threshold 500
        self.assertTrue(order.itz_needs_approval)
        with self.assertRaises(UserError):
            order.with_user(self.users['sales']).action_confirm()
        order.with_user(self.users['sales']).action_itz_request_approval()
        self.assertEqual(order.itz_approval_state, 'pending')
        with self.assertRaises(UserError):
            order.with_user(self.users['sales']).action_itz_approve()        # sales cannot approve
        order.with_user(self.users['ops']).action_itz_approve()
        self.assertEqual(order.itz_approval_state, 'approved')
        order.with_user(self.users['sales']).action_confirm()
        self.assertEqual(order.state, 'sale')

    def test_02_editing_after_approval_resets(self):
        order = self.make_quote(qty=10)
        order.with_user(self.users['sales']).action_itz_request_approval()
        order.with_user(self.users['ops']).action_itz_approve()
        order.order_line[0].with_user(self.users['sales']).write({'price_unit': 50.0})
        self.assertEqual(order.itz_approval_state, 'none')
        with self.assertRaises(UserError):
            order.with_user(self.users['sales']).action_confirm()

    def test_03_discount_above_limit_needs_approval_even_when_small(self):
        small = self.make_quote(qty=1, discount=5.0)
        self.assertFalse(small.itz_needs_approval)
        small.with_user(self.users['sales']).action_confirm()
        big_disc = self.make_quote(qty=1, discount=20.0)
        self.assertTrue(big_disc.itz_needs_approval)

    def test_04_requester_cannot_self_approve_unless_owner(self):
        order = self.make_quote(qty=10, user=self.users['ops'])
        order.with_user(self.users['ops']).action_itz_request_approval()
        with self.assertRaises(UserError):
            order.with_user(self.users['ops']).action_itz_approve()
        order.with_user(self.users['owner']).action_itz_approve()

    def test_05_end_to_end(self):
        """Receive stock, quote, approve, confirm, assign technician, install, invoice, pay."""
        tech = self.users['tech']
        self.receive(self.tracker, ['356307042441013'], user=self.users['store'])
        self.receive(self.sim, ['8925401000000000011'], user=self.users['store'])
        dev = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        simlot = self.env['stock.lot'].search([('name', '=', '8925401000000000011')])
        order = self.make_quote(qty=1)
        order.order_line[0].price_unit = 400.0     # push above approval threshold with install + plan
        order.order_line[1].price_unit = 80.0
        self.assertTrue(order.itz_needs_approval)
        order.with_user(self.users['sales']).action_itz_request_approval()
        order.with_user(self.users['ops']).action_itz_approve()
        order.with_user(self.users['sales']).action_confirm()
        # no delivery created for installed hardware; an installation job exists for the vehicle
        self.assertFalse(order.picking_ids)
        job = order.itz_installation_ids
        self.assertEqual(len(job), 1)
        self.assertEqual(job.vehicle_id, self.vehicle)
        self.assertEqual(job.line_ids.sale_line_id, order.order_line[0])
        # assign technician and devices
        job.with_user(self.users['ops']).write({'technician_id': tech.id, 'date_planned': fields.Datetime.now(), 'customer_confirmed_by': 'Mr Driver'})
        job.line_ids[0].write({'lot_id': dev.id, 'sim_lot_id': simlot.id})
        job.with_user(self.users['ops']).action_schedule()
        with self.assertRaises(UserError):
            job.with_user(tech).action_done()                       # equipment not yet issued
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id,
            'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': dev.id}), (0, 0, {'product_id': self.sim.id, 'lot_id': simlot.id})],
        }).action_confirm()
        job.with_user(tech).action_start()
        job.with_user(tech).action_done()
        self.assertEqual(job.state, 'done')
        self.assertEqual(order.order_line[0].qty_delivered, 1.0)
        # invoicing: sales cannot, accountant can
        with self.assertRaises(UserError):
            order.with_user(self.users['sales'])._create_invoices()
        invoice = order.with_user(self.users['accountant'])._create_invoices()
        self.assertEqual(len(invoice), 1)
        self.assertEqual(sum(invoice.invoice_line_ids.mapped('quantity')), 3.0)
        invoice.with_user(self.users['accountant']).action_post()
        total = invoice.amount_total
        self.assertEqual(invoice.itz_payment_status, 'unpaid')
        # partial payment
        reg = self.env['account.payment.register'].with_user(self.users['accountant']).with_context(
            active_model='account.move', active_ids=invoice.ids).create({'amount': 100.0})
        reg.action_create_payments()
        invoice.invalidate_recordset()
        self.assertEqual(invoice.payment_state, 'partial')
        self.assertEqual(invoice.itz_payment_status, 'partial')
        self.assertAlmostEqual(invoice.amount_residual, total - 100.0, places=2)
        # full payment of the remainder
        reg = self.env['account.payment.register'].with_user(self.users['accountant']).with_context(
            active_model='account.move', active_ids=invoice.ids).create({})
        reg.action_create_payments()
        invoice.invalidate_recordset()
        self.assertIn(invoice.payment_state, ('paid', 'in_payment'))
        self.assertEqual(invoice.itz_payment_status, 'paid')
        payments = self.env['account.payment'].search([('partner_id', '=', self.customer.id)])
        self.assertEqual(len(payments), 2)
        self.assertEqual(payments.mapped('itz_recorded_by_id'), self.users['accountant'])
        # audit trail
        actions = self.env['itz.audit.log'].search([]).mapped('action')
        for expected in ('Quotation approved', 'Order confirmed', 'Installation completed', 'Invoice posted', 'Payment recorded', 'Equipment issued'):
            self.assertIn(expected, actions)

    def test_06_statement_and_overdue(self):
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.invoice_date_due = fields.Date.subtract(fields.Date.today(), days=40)
        inv.invoice_date = fields.Date.subtract(fields.Date.today(), days=60)
        inv.with_user(self.users['accountant']).action_post()
        inv.invalidate_recordset()
        self.assertTrue(inv.itz_is_overdue)
        self.assertEqual(inv.itz_payment_status, 'overdue')
        self.assertEqual(self.env['account.move'].search([('itz_is_overdue', '=', True)]), inv)
        self.customer.invalidate_recordset()
        cust = self.customer.with_user(self.users['accountant'])
        self.assertAlmostEqual(cust.itz_overdue_amount, inv.amount_total, places=2)
        self.assertEqual(cust.itz_overdue_count, 1)
        wiz = self.env['itz.statement.wizard'].with_user(self.users['accountant']).create({
            'partner_id': self.customer.id, 'date_from': fields.Date.subtract(fields.Date.today(), days=90)})
        data = wiz._get_data()
        self.assertAlmostEqual(data['closing'], inv.amount_total, places=2)
        self.assertAlmostEqual(data['ageing']['d31_60'], inv.amount_total, places=2)
        html, _ = self.env['ir.actions.report']._render_qweb_html('itz_finance.action_report_statement', wiz.ids)
        self.assertIn(b'Statement of Account', html)

    def test_07_non_financial_roles_cannot_see_money(self):
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.with_user(self.users['accountant']).action_post()
        for key in ('tech', 'store'):
            with self.assertRaises(AccessError):
                inv.with_user(self.users[key]).read(['amount_total'])
        # a sales officer sees invoices of their own orders only
        self.assertTrue(inv.with_user(self.users['sales']).read(['amount_total']))
        inv.sudo().invoice_user_id = self.users['ops']
        with self.assertRaises(AccessError):
            inv.with_user(self.users['sales']).read(['amount_total'])
        with self.assertRaises(AccessError):
            self.env['account.payment'].with_user(self.users['tech']).search([])
        self.assertTrue(inv.with_user(self.users['readonly']).read(['amount_total']))

    def test_08_only_approver_resets_posted_invoice(self):
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.with_user(self.users['accountant']).action_post()
        with self.assertRaises(UserError):
            inv.with_user(self.users['accountant']).button_draft()
        inv.with_user(self.users['ops']).button_draft()
        self.assertEqual(inv.state, 'draft')

    def test_09_reports_render(self):
        order = self.make_quote(qty=1)
        html, _ = self.env['ir.actions.report']._render_qweb_html('sale.action_report_saleorder', order.ids)
        self.assertIn(b'Vehicle: ', html)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.with_user(self.users['accountant']).action_post()
        html, _ = self.env['ir.actions.report']._render_qweb_html('account.account_invoices', inv.ids)
        self.assertIn(b'Balance due', html)
        reg = self.env['account.payment.register'].with_context(active_model='account.move', active_ids=inv.ids).create({'amount': 20.0})
        pay = reg._create_payments()
        html, _ = self.env['ir.actions.report']._render_qweb_html('account.action_report_payment_receipt', pay.ids)
        self.assertIn(b'Remaining on these invoices', html)

    def test_10_enquiry_to_quotation(self):
        enq = self.env['itz.enquiry'].with_user(self.users['sales']).create({
            'contact_name': 'Jane Doe', 'company_name': 'Jane Transport', 'email': 'jane@example.com',
            'phone': '+254733000000', 'country': 'Kenya', 'vehicles': '12', 'message': 'Need trackers for 12 trucks'})
        res = enq.action_create_quotation()
        order = self.env['sale.order'].browse(res['res_id'])
        self.assertEqual(order.partner_id.name, 'Jane Transport')
        self.assertEqual(enq.state, 'quoted')
        enq2 = self.env['itz.enquiry'].create({'contact_name': 'Jane Doe', 'company_name': 'Jane Transport', 'email': 'JANE@example.com'})
        enq2.action_create_customer()
        self.assertEqual(enq2.partner_id, order.partner_id)     # matched by email, no duplicate customer
