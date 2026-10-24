from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon


@tagged('post_install', '-at_install', 'itz')
class TestSubscription(ItzSalesCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.plan.product_tmpl_id.itz_plan_cycle = 'monthly'
        cls.today = fields.Date.today()

    def _pay(self, invoice, amount=None, user=None):
        ctx = dict(active_model='account.move', active_ids=invoice.ids)
        vals = {'amount': amount} if amount else {}
        reg = self.env['account.payment.register'].with_user(user or self.users['accountant']).with_context(**ctx).create(vals)
        return reg.action_create_payments()

    def _sold_and_installed(self):
        """Sell tracker + plan for the vehicle, install it, return (order, subscription)."""
        tech = self.users['tech']
        self.receive(self.tracker, ['356307042441013'])
        dev = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        order = self.make_quote(qty=1)
        order.order_line[0].price_unit = 400.0
        order.with_user(self.users['sales']).action_itz_request_approval()
        order.with_user(self.users['ops']).action_itz_approve()
        order.with_user(self.users['sales']).action_confirm()
        sub = order.itz_subscription_ids
        self.assertEqual(len(sub), 1)
        self.assertEqual(sub.state, 'draft')
        job = order.itz_installation_ids
        job.with_user(self.users['ops']).write({'technician_id': tech.id, 'date_planned': fields.Datetime.now(), 'customer_confirmed_by': 'Driver'})
        job.line_ids[0].write({'lot_id': dev.id})
        job.with_user(self.users['ops']).action_schedule()
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id, 'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': dev.id})]}).action_confirm()
        job.with_user(tech).action_done()
        return order, sub

    def test_01_activation_on_installation_and_first_period_payment(self):
        order, sub = self._sold_and_installed()
        self.assertEqual(sub.state, 'active')
        self.assertEqual(sub.activation_date, self.today)
        self.assertEqual(sub.next_renewal_date, fields.Date.add(self.today, months=1))
        self.assertEqual(len(sub.sudo().period_ids), 1)
        self.assertEqual(sub.payment_status, 'unbilled')
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.with_user(self.users['accountant']).action_post()
        sub.invalidate_recordset(); sub.period_ids.invalidate_recordset()
        self.assertEqual(sub.sudo().period_ids.invoice_id, inv)
        self.assertEqual(sub.payment_status, 'unpaid')
        self._pay(inv, amount=50.0)
        sub.invalidate_recordset(); sub.period_ids.invalidate_recordset()
        self.assertEqual(sub.payment_status, 'partial')
        self._pay(inv)
        sub.invalidate_recordset(); sub.period_ids.invalidate_recordset()
        self.assertEqual(sub.payment_status, 'paid')
        self.assertTrue(sub.sudo().period_ids.paid_date)

    def test_02_renewal_invoice_cycle(self):
        order, sub = self._sold_and_installed()
        inv0 = order.with_user(self.users['accountant'])._create_invoices()
        inv0.with_user(self.users['accountant']).action_post()
        self._pay(inv0)
        # move the renewal date close so the billing cron picks it up
        sub.sudo().next_renewal_date = fields.Date.add(self.today, days=10)
        self.env['itz.subscription']._cron_billing()
        sub.invalidate_recordset()
        renewal = sub.sudo().period_ids.filtered(lambda p: p.kind == 'renewal')
        self.assertEqual(len(renewal), 1)
        self.assertEqual(renewal.period_start, fields.Date.add(self.today, days=10))
        self.assertEqual(renewal.period_end, fields.Date.add(fields.Date.add(self.today, days=10), months=1))
        self.assertEqual(renewal.invoice_id.state, 'posted')
        self.assertEqual(renewal.invoice_id.itz_subscription_id, sub)
        self.assertEqual(renewal.invoice_id.amount_untaxed, 10.0)
        self.assertEqual(sub.payment_status, 'unpaid')
        # cron is idempotent
        self.env['itz.subscription']._cron_billing()
        self.assertEqual(len(sub.sudo().period_ids.filtered(lambda p: p.kind == 'renewal')), 1)
        # pay: renewal date moves to period end
        self._pay(renewal.invoice_id)
        sub.invalidate_recordset()
        self.assertEqual(sub.next_renewal_date, fields.Date.add(fields.Date.add(self.today, days=10), months=1))
        self.assertEqual(sub.payment_status, 'paid')
        self.assertEqual(sub.state, 'active')

    def test_03_expiry_and_reactivation(self):
        order, sub = self._sold_and_installed()
        sub.sudo().next_renewal_date = fields.Date.subtract(self.today, days=3)
        self.env['itz.subscription']._cron_billing()          # invoice for the next period
        sub.invalidate_recordset()
        renewal = sub.sudo().period_ids.filtered(lambda p: p.kind == 'renewal')
        self.assertEqual(len(renewal), 1)
        self.assertEqual(renewal.state, 'overdue')            # due date is in the past
        self.assertEqual(sub.payment_status, 'overdue')
        # inside grace period (7 days): still active
        self.env['itz.subscription']._cron_expire()
        self.assertEqual(sub.state, 'active')
        sub.sudo().next_renewal_date = fields.Date.subtract(self.today, days=20)
        self.env['itz.subscription']._cron_expire()
        sub.invalidate_recordset()
        self.assertEqual(sub.state, 'expired')
        self._pay(renewal.invoice_id)
        sub.invalidate_recordset()
        self.assertEqual(sub.state, 'active')
        self.assertGreaterEqual(sub.next_renewal_date, renewal.period_end)

    def test_04_reminders_once_per_week(self):
        order, sub = self._sold_and_installed()
        sub.sudo().next_renewal_date = fields.Date.add(self.today, days=5)
        mails_before = self.env['mail.mail'].search_count([('model', '=', 'itz.subscription')])
        self.env['itz.subscription']._cron_reminders()
        self.env['itz.subscription']._cron_reminders()
        self.assertEqual(sub.last_reminder_date, self.today)
        self.assertEqual(self.env['mail.mail'].search_count([('model', '=', 'itz.subscription')]), mails_before + 1)
        self.assertTrue(self.env['mail.activity'].search([('res_model', '=', 'itz.subscription'), ('res_id', '=', sub.id)]))

    def test_05_renewal_state_filters(self):
        order, sub = self._sold_and_installed()
        S = self.env['itz.subscription']
        sub.sudo().next_renewal_date = fields.Date.add(self.today, days=5)
        self.assertEqual(S.search([('renewal_state', '=', 'due')]), sub)
        sub.sudo().next_renewal_date = fields.Date.subtract(self.today, days=1)
        self.assertEqual(S.search([('renewal_state', '=', 'late')]), sub)
        sub.sudo().next_renewal_date = fields.Date.add(self.today, days=60)
        self.assertEqual(S.search([('renewal_state', '=', 'ok')]), sub)

    def test_06_quarterly_cycle_and_price_control(self):
        quarterly = self.env['product.product'].create({'name': 'Plan quarterly', 'itz_category': 'plan', 'list_price': 27.0, 'itz_plan_cycle': 'quarterly'})
        sub = self.env['itz.subscription'].create({'partner_id': self.customer.id, 'vehicle_id': self.vehicle.id, 'plan_id': quarterly.id})
        self.assertEqual(sub.cycle, 'quarterly')
        self.assertEqual(sub.price, 27.0)
        sub.action_activate()
        self.assertEqual(sub.next_renewal_date, fields.Date.add(self.today, months=3))
        with self.assertRaises(UserError):
            sub.with_user(self.users['sales']).write({'price': 1.0})
        sub.with_user(self.users['ops']).write({'price': 30.0})
        self.assertEqual(sub.price, 30.0)

    def test_07_cancel_and_vehicle_links(self):
        order, sub = self._sold_and_installed()
        self.assertEqual(self.vehicle.active_subscription_id, sub)
        self.assertEqual(self.vehicle.subscription_count, 1)
        sub.with_user(self.users['ops']).action_suspend()
        self.assertEqual(sub.state, 'suspended')
        sub.with_user(self.users['ops']).action_resume()
        self.assertEqual(sub.state, 'active')
        sub.with_user(self.users['ops']).action_cancel()
        self.assertEqual(sub.state, 'cancelled')
        with self.assertRaises(UserError):
            sub.unlink()
