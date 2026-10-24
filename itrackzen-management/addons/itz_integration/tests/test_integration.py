import json
from unittest.mock import MagicMock, patch

import requests

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import HttpCase, tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon

POST = 'odoo.addons.itz_integration.models.adapters.requests.post'


def fake_response(status=200, body=None):
    resp = MagicMock()
    resp.status_code = status
    resp.ok = status < 400
    resp.content = json.dumps(body or {}).encode()
    resp.text = json.dumps(body or {})
    resp.json.return_value = body or {}
    return resp


@tagged('post_install', '-at_install', 'itz')
class TestIntegration(ItzSalesCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.cfg = cls.env['itz.platform.config'].get_config()
        cls.Job = cls.env['itz.sync.job']

    def _mode(self, mode):
        self.cfg.sudo().write({'mode': mode, 'api_base_url': 'https://platform.example/api/itz', 'api_key': 'secret-token'})

    def _fresh_vehicle(self, plate='KDB 555C'):
        self.Job.search([]).unlink()
        return self.env['itz.vehicle'].create({'plate': plate, 'partner_id': self.customer.id, 'make': 'Toyota'})

    def test_01_disabled_queues_nothing(self):
        self._mode('disabled')
        self._fresh_vehicle()
        self.assertFalse(self.Job.search([]))

    def test_02_dry_run_logs_but_does_not_send(self):
        self._mode('dry_run')
        veh = self._fresh_vehicle()
        jobs = self.Job.search([])
        self.assertEqual(set(jobs.mapped('operation')), {'customer', 'vehicle'})
        with patch(POST) as post:
            jobs.process()
            post.assert_not_called()
        self.assertEqual(set(jobs.mapped('state')), {'dry_run'})
        self.assertIn('KDB 555C', jobs.filtered(lambda j: j.operation == 'vehicle').payload)
        self.assertFalse(veh.itz_platform_vehicle_id)

    def test_03_live_sends_signed_request_and_stores_platform_ids(self):
        self._mode('live')
        veh = self._fresh_vehicle()

        def fake_post(url, data=None, headers=None, auth=None, timeout=None):
            payload = json.loads(data)
            self.assertEqual(headers['Authorization'], 'Bearer secret-token')
            self.assertTrue(self.cfg.verify(data, headers['X-ITZ-Signature']))
            self.assertTrue(headers['Idempotency-Key'])
            if url.endswith('/customers'):
                return fake_response(200, {'id': 'PC-77'})
            if url.endswith('/vehicles'):
                self.assertEqual(payload['customer_id'], 'PC-77')   # parent was synced first
                return fake_response(200, {'id': 'PV-88'})
            return fake_response(200, {})
        with patch(POST, side_effect=fake_post) as post:
            self.Job.search([]).sorted('id').process()
            self.assertTrue(post.called)
        self.customer.invalidate_recordset(); veh.invalidate_recordset()
        self.assertEqual(self.customer.itz_platform_customer_id, 'PC-77')
        self.assertEqual(veh.itz_platform_vehicle_id, 'PV-88')
        self.assertTrue(veh.itz_platform_synced_at)

    def test_04_failures_retry_with_backoff_then_fail(self):
        self._mode('live')
        self._fresh_vehicle()
        job = self.Job.search([('operation', '=', 'customer')])
        with patch(POST, return_value=fake_response(503, {'error': 'down'})):
            job.process()
        self.assertEqual(job.state, 'pending')
        self.assertEqual(job.attempts, 1)
        self.assertGreater(job.next_try, fields.Datetime.now())
        # permanent rejection fails immediately and raises a task for the admin
        job.next_try = fields.Datetime.now()
        with patch(POST, return_value=fake_response(422, {'error': 'bad data'})):
            job.process()
        self.assertEqual(job.state, 'failed')
        self.assertTrue(self.env['itz.task'].search([('name', 'ilike', 'Platform sync failed')]))
        job.action_retry()
        self.assertEqual(job.state, 'pending')

    def test_05_network_error_is_retried(self):
        self._mode('live')
        self._fresh_vehicle()
        job = self.Job.search([('operation', '=', 'customer')])
        with patch(POST, side_effect=requests.ConnectionError('boom')):
            job.process()
        self.assertEqual(job.state, 'pending')
        self.assertIn('Network error', job.last_error)

    def test_06_no_duplicate_jobs_for_unchanged_data(self):
        self._mode('dry_run')
        veh = self._fresh_vehicle()
        count = self.Job.search_count([])
        veh.write({'make': 'Toyota'})      # same value: same payload
        veh.write({'notes': 'internal'})   # not a synced field
        self.assertEqual(self.Job.search_count([]), count)
        veh.write({'make': 'Nissan'})
        self.assertEqual(self.Job.search_count([]), count + 1)

    def test_07_staging_simulator_assigns_simulated_ids(self):
        self._mode('mock')
        veh = self._fresh_vehicle()
        with patch(POST) as post:
            self.Job.search([]).sorted('id').process()
            post.assert_not_called()
        self.assertTrue(veh.itz_platform_vehicle_id.startswith('SIM-'))
        self.assertTrue(self.customer.itz_platform_customer_id.startswith('SIM-'))
        self.assertEqual(set(self.Job.search([]).mapped('state')), {'simulated'})

    def test_08_service_status_and_device_jobs(self):
        self._mode('dry_run')
        tech = self.users['tech']
        self.receive(self.tracker, ['356307042441013'])
        dev = self.env['stock.lot'].search([('itz_imei', '=', '356307042441013')])
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id, 'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': dev.id})]}).action_confirm()
        order = self.make_quote(qty=1)
        order.with_user(self.users['sales']).action_confirm()
        job = order.itz_installation_ids
        job.with_user(self.users['ops']).write({'technician_id': tech.id, 'date_planned': fields.Datetime.now(), 'customer_confirmed_by': 'D'})
        job.line_ids[0].write({'lot_id': dev.id})
        job.with_user(self.users['ops']).action_schedule()
        self.Job.search([]).unlink()
        job.with_user(tech).action_done()
        ops = self.Job.search([]).mapped('operation')
        self.assertIn('device', ops)
        self.assertIn('service', ops)
        device_job = self.Job.search([('operation', '=', 'device')], limit=1)
        device_job.process()
        self.assertIn('356307042441013', device_job.payload)

    def test_09_ids_owned_by_platform_cannot_be_edited_by_regular_staff(self):
        veh = self._fresh_vehicle()
        with self.assertRaises(UserError):
            veh.with_user(self.users['sales']).write({'itz_platform_vehicle_id': 'X1'})
        veh.with_user(self.users['ops']).write({'itz_platform_vehicle_id': 'X1'})
        other = self.env['itz.vehicle'].create({'plate': 'KDC 1D', 'partner_id': self.customer.id})
        with self.assertRaises(Exception):
            other.with_user(self.users['ops']).write({'itz_platform_vehicle_id': 'X1'})    # unique

    def test_10_only_owner_changes_mode(self):
        with self.assertRaises(UserError):
            self.cfg.with_user(self.users['ops']).write({'mode': 'live'})

    def test_11_links(self):
        self.cfg.sudo().write({'customer_url_tpl': '{base}/admin/clients/{id}', 'vehicle_url_tpl': '{base}/admin/objects/{id}?imei={imei}',
                               'base_url': 'https://itrackzen.com/'})
        self.customer.with_context(itz_platform_internal=True).itz_platform_customer_id = 'C9'
        self.assertEqual(self.customer._itz_link(), 'https://itrackzen.com/admin/clients/C9')
        self.vehicle.with_context(itz_platform_internal=True).itz_platform_vehicle_id = 'V5'
        self.assertEqual(self.vehicle._itz_link(), 'https://itrackzen.com/admin/objects/V5?imei=')
        action = self.vehicle.action_open_in_platform()
        self.assertEqual(action['type'], 'ir.actions.act_url')
        self.cfg.sudo().vehicle_url_tpl = False
        with self.assertRaises(UserError):
            self.vehicle.action_open_in_platform()


@tagged('post_install', '-at_install', 'itz')
class TestPlatformWebhook(HttpCase):

    def setUp(self):
        super().setUp()
        self.cfg = self.env['itz.platform.config'].get_config()
        self.cfg.sudo().write({'mode': 'live', 'api_base_url': 'https://platform.example/api'})
        self.partner = self.env['res.partner'].create({'name': 'Hook Customer', 'email': 'hook@example.com'})
        self.vehicle = self.env['itz.vehicle'].create({'plate': 'KHK 100H', 'partner_id': self.partner.id})
        self.env.cr.flush()

    def _post(self, event, sign=True, secret=None):
        body = json.dumps(event).encode()
        sig = self.cfg.sign(body) if sign else 'bad'
        return self.url_open('/itz/platform/webhook', data=body, headers={'X-ITZ-Signature': sig, 'Content-Type': 'application/json'})

    def test_webhook_security_idempotency_and_matching(self):
        # unsigned/invalid
        self.assertEqual(self._post({'id': 'e1'}, sign=False).status_code, 401)
        event = {'id': 'evt-1', 'type': 'object.created', 'data': {'vehicle_id': 'PV-1', 'plate': 'khk-100h', 'customer_id': 'PC-1', 'email': 'HOOK@example.com'}}
        res = self._post(event)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'matched')
        self.vehicle.invalidate_recordset(); self.partner.invalidate_recordset()
        self.assertEqual(self.vehicle.itz_platform_vehicle_id, 'PV-1')
        self.assertEqual(self.partner.itz_platform_customer_id, 'PC-1')
        # same event again: ignored
        self.assertEqual(self._post(event).json()['status'], 'duplicate')
        # unknown object: recorded for review, nothing created
        before = self.env['itz.vehicle'].search_count([])
        res = self._post({'id': 'evt-2', 'type': 'object.created', 'data': {'vehicle_id': 'PV-9', 'plate': 'UNKNOWN 1'}})
        self.assertEqual(res.json()['status'], 'unmatched')
        self.assertEqual(self.env['itz.vehicle'].search_count([]), before)
        # an existing different platform id is never overwritten
        res = self._post({'id': 'evt-3', 'type': 'object.updated', 'data': {'vehicle_id': 'PV-OTHER', 'plate': 'KHK 100H'}})
        self.vehicle.invalidate_recordset()
        self.assertEqual(self.vehicle.itz_platform_vehicle_id, 'PV-1')

    def test_deep_link_requires_login_and_redirects(self):
        res = self.url_open('/itz/go/vehicle?plate=KHK100H', allow_redirects=False)
        self.assertIn(res.status_code, (302, 303))
        self.assertIn('/web/login', res.headers['Location'])
        self.authenticate('admin', 'admin')
        res = self.url_open('/itz/go/vehicle?plate=khk-100h', allow_redirects=False)
        self.assertIn(res.status_code, (301, 302, 303), res.text[:200])
        self.assertIn('/odoo/action-itz_fleet.action_itz_vehicles/%s' % self.vehicle.id, res.headers['Location'])
