import io

from odoo import fields
from odoo.exceptions import AccessError
from odoo.tests import HttpCase, tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon


@tagged('post_install', '-at_install', 'itz')
class TestDashboard(ItzSalesCommon):

    def _tiles(self, user):
        data = self.env['itz.dashboard'].with_user(user).get_data()
        return {t['key']: t for s in data['sections'] for t in s['tiles']}, data

    def test_01_tiles_depend_on_role(self):
        tech_tiles, tech_data = self._tiles(self.users['tech'])
        self.assertIn('my_jobs', tech_tiles)
        self.assertIn('my_equipment', tech_tiles)
        for forbidden in ('inv_due', 'sales_month', 'sub_active', 'dev_avail', 'team_open'):
            self.assertNotIn(forbidden, tech_tiles)
        sales_tiles, _ = self._tiles(self.users['sales'])
        self.assertIn('quotes', sales_tiles)
        self.assertIn('sub_active', sales_tiles)
        self.assertNotIn('inv_due', sales_tiles)
        self.assertNotIn('sales_month', sales_tiles)          # money figures need the financial privilege
        acc_tiles, _ = self._tiles(self.users['accountant'])
        self.assertIn('inv_due', acc_tiles)
        self.assertTrue(acc_tiles['inv_due']['money'])
        ops_tiles, ops_data = self._tiles(self.users['ops'])
        for key in ('team_open', 'inv_overdue', 'approvals', 'dev_avail', 'inst_active'):
            self.assertIn(key, ops_tiles)
        self.assertIn('Operations Manager', ops_data['roles'])

    def test_02_tile_values_follow_data(self):
        self.receive(self.tracker, ['356307042441013', '356307042441021'])
        tiles, _ = self._tiles(self.users['store'])
        self.assertEqual(tiles['dev_avail']['value'], 2)
        self.assertEqual(tiles['low_stock']['value'], 1)           # alert level 2, available 2
        tech = self.users['tech']
        dev = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id, 'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': dev.id})]}).action_confirm()
        tiles, _ = self._tiles(self.users['store'])
        self.assertEqual(tiles['dev_avail']['value'], 1)
        self.assertEqual(tiles['dev_issued']['value'], 1)
        tech_tiles, _ = self._tiles(tech)
        self.assertEqual(tech_tiles['my_equipment']['value'], 1)

    def test_03_global_search(self):
        self.receive(self.tracker, ['356307042441013'])
        D = self.env['itz.dashboard']
        by_plate = D.with_user(self.users['support']).search_global('kda123')
        self.assertTrue(any(g['model'] == 'itz.vehicle' for g in by_plate))
        by_phone = D.with_user(self.users['support']).search_global('700111222')
        self.assertTrue(any(g['model'] == 'res.partner' for g in by_phone))
        by_imei = D.with_user(self.users['store']).search_global('356307042441013')
        self.assertTrue(any(g['model'] == 'stock.lot' for g in by_imei))
        self.assertEqual(D.search_global('x'), [])
        # a technician only finds records that are theirs
        res = D.with_user(self.users['tech']).search_global('Acme')
        self.assertFalse([g for g in res if g['model'] == 'res.partner'])

    def _wizard(self, user, rtype, **kw):
        return self.env['itz.report.wizard'].with_user(user).create(dict(report_type=rtype, date_from=fields.Date.subtract(fields.Date.today(), days=30),
                                                                         date_to=fields.Date.add(fields.Date.today(), days=30), **kw))

    def test_04_reports_run_and_export(self):
        self.receive(self.tracker, ['356307042441013'])
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        inv = order.with_user(self.users['accountant'])._create_invoices()
        inv.with_user(self.users['accountant']).action_post()
        self.env['account.payment.register'].with_user(self.users['accountant']).with_context(
            active_model='account.move', active_ids=inv.ids).create({'amount': 20.0}).action_create_payments()
        keys = ['stock_availability', 'stock_movement', 'installed_devices', 'sales', 'payments', 'outstanding', 'overdue', 'subscriptions',
                'renewals', 'installations_tech', 'maintenance_tech', 'employee_tasks']
        for key in keys:
            wiz = self._wizard(self.users['owner'], key)
            data = wiz.get_report()
            self.assertTrue(data['columns'], key)
            self.assertTrue(wiz.preview_html, key)
            xlsx = wiz.to_xlsx()
            self.assertTrue(xlsx.startswith(b'PK'), key)           # a real xlsx (zip) file
            html, _ = self.env['ir.actions.report']._render_qweb_html('itz_dashboard.action_report_itz', wiz.ids)
            self.assertIn(data['title'].encode(), html, key)
        sales = self._wizard(self.users['owner'], 'sales').get_report()
        self.assertEqual(len(sales['rows']), 1)
        self.assertAlmostEqual(sales['totals'][-1], order.amount_total, places=2)
        pay = self._wizard(self.users['owner'], 'payments').get_report()
        self.assertEqual(pay['totals'][-1], 20.0)
        out = self._wizard(self.users['owner'], 'outstanding').get_report()
        self.assertAlmostEqual(out['totals'][7], inv.amount_total - 20.0, places=2)
        stock = self._wizard(self.users['owner'], 'stock_availability').get_report()
        self.assertTrue(any('GPS Tracker X1' in r[0] for r in stock['rows']))

    def test_05_report_access_control(self):
        with self.assertRaises(AccessError):
            self._wizard(self.users['sales'], 'payments').get_report()
        with self.assertRaises(AccessError):
            self._wizard(self.users['tech'], 'stock_availability').get_report()
        with self.assertRaises(AccessError):
            self._wizard(self.users['support'], 'employee_tasks').get_report()
        self.assertTrue(self._wizard(self.users['accountant'], 'overdue').get_report()['columns'])
        self.assertTrue(self._wizard(self.users['store'], 'stock_availability').get_report()['columns'])

    def test_06_new_staff_get_dashboard_as_home(self):
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'New Sales', 'login': 'new_sales', 'groups_id': [(6, 0, [self.env.ref('base.group_user').id, self.env.ref('itz_base.group_itz_sales').id])]})
        self.assertEqual(user.action_id.id, self.env.ref('itz_dashboard.action_itz_dashboard').id)


@tagged('post_install', '-at_install', 'itz')
class TestReportDownload(HttpCase):

    def test_xlsx_download_requires_permission(self):
        self.authenticate('admin', 'admin')
        res = self.url_open('/itz/report/xlsx?type=stock_availability')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'PK'))
        self.assertIn('spreadsheetml', res.headers['Content-Type'])
