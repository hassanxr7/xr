from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, UserError
from odoo.tests import tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon


@tagged('post_install', '-at_install', 'itz')
class TestTasks(ItzSalesCommon):

    def _task(self, user, owner=None, **kw):
        vals = {'name': 'Call customer', 'assigned_user_id': (owner or user).id, 'partner_id': self.customer.id,
                'date_deadline': fields.Datetime.now() + timedelta(days=1)}
        vals.update(kw)
        return self.env['itz.task'].with_user(user).create(vals)

    def test_01_task_lifecycle_and_overdue(self):
        t = self._task(self.users['sales'])
        self.assertEqual(t.state, 'pending')
        self.assertFalse(t.is_overdue)
        t.with_user(self.users['sales']).action_start()
        t.write({'date_deadline': fields.Datetime.now() - timedelta(hours=2)})
        t.invalidate_recordset()
        self.assertTrue(t.is_overdue)
        self.assertEqual(t.display_status, 'overdue')
        self.assertEqual(self.env['itz.task'].search([('display_status', '=', 'overdue')]), t)
        self.assertEqual(self.env['itz.task'].search([('is_overdue', '=', True)]), t)
        t.with_user(self.users['sales']).action_done()
        t.invalidate_recordset()
        self.assertEqual(t.state, 'completed')
        self.assertFalse(t.is_overdue)
        self.assertTrue(t.date_done)

    def test_02_visibility_by_role(self):
        mine = self._task(self.users['sales'])
        assigned_to_tech = self._task(self.users['ops'], owner=self.users['tech'])
        other = self._task(self.users['support'])
        Task = self.env['itz.task']
        self.assertEqual(Task.with_user(self.users['tech']).search([]), assigned_to_tech)
        self.assertEqual(Task.with_user(self.users['sales']).search([]), mine)
        self.assertEqual(Task.with_user(self.users['ops']).search([]), mine | assigned_to_tech | other)
        self.assertEqual(Task.with_user(self.users['readonly']).search([]), mine | assigned_to_tech | other)
        with self.assertRaises(AccessError):
            other.with_user(self.users['tech']).read(['name'])
        # readonly role cannot change anything
        with self.assertRaises(AccessError):
            mine.with_user(self.users['readonly']).write({'name': 'x'})

    def test_03_only_owner_or_manager_completes(self):
        t = self._task(self.users['ops'], owner=self.users['sales'])
        with self.assertRaises(UserError):
            t.with_user(self.users['support']).action_done()
        t.with_user(self.users['sales']).action_done()
        self.assertEqual(t.state, 'completed')

    def test_04_reassign_rules(self):
        t = self._task(self.users['sales'])
        t.with_user(self.users['sales']).write({'assigned_user_id': self.users['support'].id})     # creator may reassign
        with self.assertRaises(UserError):
            t.with_user(self.users['support']).write({'assigned_user_id': self.users['sales'].id})   # assignee may not
        t.with_user(self.users['ops']).write({'assigned_user_id': self.users['sales'].id})

    def test_05_installation_creates_and_closes_task(self):
        tech = self.users['tech']
        self.receive(self.tracker, ['356307042441013'])
        dev = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id, 'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': dev.id})]}).action_confirm()
        job = self.env['itz.installation'].with_user(self.users['ops']).create({
            'partner_id': self.customer.id, 'vehicle_id': self.vehicle.id, 'technician_id': tech.id,
            'date_planned': fields.Datetime.now() + timedelta(hours=3), 'customer_confirmed_by': 'Driver',
            'line_ids': [(0, 0, {'action': 'install', 'product_id': self.tracker.id, 'lot_id': dev.id})]})
        job.action_schedule()
        task = job.task_id
        self.assertTrue(task)
        self.assertEqual(task.assigned_user_id, tech)
        self.assertEqual(task.task_type, 'installation')
        self.assertEqual(self.env['itz.task'].with_user(tech).search([]), task)
        # technician can see the customer and vehicle through the task / job
        self.assertEqual(self.env['res.partner'].with_user(tech).search([('id', '=', self.customer.id)]), self.customer)
        job.with_user(tech).action_start()
        self.assertEqual(task.state, 'in_progress')
        job.with_user(tech).action_done()
        self.assertEqual(task.state, 'completed')
        self.assertIn('356307042441013', task.result_note)
        employee = tech.employee_id
        self.assertEqual(employee.itz_done_task_count, 1)

    def test_06_collection_task_created_and_closed_on_payment(self):
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.invoice_date = fields.Date.subtract(fields.Date.today(), days=30)
        inv.invoice_date_due = fields.Date.subtract(fields.Date.today(), days=10)
        inv.with_user(self.users['accountant']).action_post()
        self.env['itz.task']._cron_collection_tasks()
        self.env['itz.task']._cron_collection_tasks()      # idempotent
        tasks = self.env['itz.task'].search([('invoice_id', '=', inv.id)])
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks.task_type, 'payment_collection')
        reg = self.env['account.payment.register'].with_user(self.users['accountant']).with_context(active_model='account.move', active_ids=inv.ids).create({})
        reg.action_create_payments()
        tasks.invalidate_recordset()
        self.assertEqual(tasks.state, 'completed')

    def test_07_employee_profile_fields(self):
        emp = self.users['tech'].employee_id
        emp.sudo().write({'itz_responsibilities': 'Installs trackers in Nairobi region', 'job_id': self.env.ref('itz_tasks.job_technician').id,
                          'department_id': self.env.ref('itz_tasks.dept_installation').id})
        self.assertTrue(emp.itz_stock_location_id)
        self.assertEqual(emp.itz_stock_location_id.itz_technician_user_id, self.users['tech'])
