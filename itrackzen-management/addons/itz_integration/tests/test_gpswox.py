import json
import re
from unittest.mock import MagicMock, patch

from odoo import fields
from odoo.tests import tagged
from odoo.addons.itz_sales.tests.common import ItzSalesCommon

REQUEST = 'odoo.addons.itz_integration.models.adapters.requests.request'
IMEI = '356307042441013'


class FakeGpswox:
    """Behaves like the GPSWOX API as documented at gpswox.stoplight.io (only the calls the adapter uses)."""

    def __init__(self):
        self.devices = {}
        self.clients = {}
        self.calls = []
        self.logins = 0
        self.hash = 'HASH-1'
        self.next_id = 100

    def response(self, status, body):
        resp = MagicMock()
        resp.status_code = status
        resp.ok = status < 400
        resp.content = json.dumps(body).encode()
        resp.text = json.dumps(body)
        resp.json.return_value = body
        return resp

    def __call__(self, method, url, params=None, json=None, data=None, timeout=None, headers=None):
        path = re.sub(r'^https?://[^/]+/api', '', url)
        self.calls.append((method, path, dict(params or {}), json))
        if path == '/login':
            if (data or {}).get('email') == 'svc@itrackzen.net' and (data or {}).get('password') == 'pw':
                self.logins += 1
                return self.response(200, {'status': 1, 'user_api_hash': self.hash, 'permissions': {}})
            return self.response(401, {'status': 0, 'message': 'Wrong credentials'})
        if (params or {}).get('user_api_hash') != self.hash:
            return self.response(401, {'status': 0, 'message': 'Unauthorized'})
        if method == 'GET' and path == '/admin/devices':
            rows = [d for d in self.devices.values() if (params.get('s') or '') in (d['imei'] or '')]
            return self.response(200, {'status': 1, 'data': rows, 'pagination': {}})
        if method == 'POST' and path == '/add_device':
            if any(d['imei'] == json['imei'] for d in self.devices.values()):
                return self.response(400, {'status': 0, 'errors': {'imei': ['The imei has already been taken.']}})
            self.next_id += 1
            self.devices[self.next_id] = dict(json, id=self.next_id, expiration_date=None, active=True)
            return self.response(200, {'status': 1, 'id': self.next_id})
        if method == 'POST' and path == '/edit_device':
            self.devices[int(params['device_id'])].update(json)
            return self.response(200, {'status': 1})
        m = re.match(r'/admin/device/(\d+)/(user|expiration|status)$', path)
        if method == 'POST' and m:
            dev = self.devices[int(m.group(1))]
            if m.group(2) == 'expiration':
                dev['expiration_date'] = json['expiration_date']
            elif m.group(2) == 'status':
                dev['active'] = bool(json['active'])
            else:
                dev['user_id'] = json['user_id']
            return self.response(200, {'status': 1})
        if method == 'GET' and path == '/admin/clients':
            return self.response(200, {'status': 1, 'data': list(self.clients.values())})
        if method in ('POST', 'PUT') and path == '/admin/client':
            if method == 'POST':
                self.next_id += 1
                self.clients[self.next_id] = dict(json, id=self.next_id)
                return self.response(200, {'status': 1, 'item': {'id': self.next_id}})
            self.clients[json['id']].update(json)
            return self.response(200, {'status': 1})
        return self.response(404, {'status': 0})

    def paths(self):
        return [(m, p) for m, p, _q, _b in self.calls if p != '/login']


@tagged('post_install', '-at_install', 'itz')
class TestGpswoxAdapter(ItzSalesCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.cfg = cls.env['itz.platform.config'].get_config()
        cls.Job = cls.env['itz.sync.job']

    def _setup(self, mode='live', **extra):
        vals = {'mode': mode, 'platform_type': 'gpswox', 'api_base_url': 'https://platform.example/api',
                'gpswox_email': 'svc@itrackzen.net', 'gpswox_password': 'pw', 'gpswox_hash': False,
                'gpswox_create_clients': False, 'gpswox_push_expiry': True, 'gpswox_deactivate_expired': False}
        vals.update(extra)
        self.cfg.sudo().write(vals)

    def _install_tracker(self):
        """Run a whole installation so the device, vehicle and subscription exist, then return the jobs queued."""
        tech = self.users['tech']
        self.receive(self.tracker, [IMEI])
        dev = self.env['stock.lot'].search([('itz_imei', '=', IMEI)])
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
        return dev

    def test_01_dry_run_lists_the_calls_and_sends_nothing(self):
        self._setup('dry_run')
        self._install_tracker()
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            self.Job.search([]).sorted('id').process()
        self.assertFalse(fake.calls)
        device_job = self.Job.search([('operation', '=', 'device')], limit=1)
        self.assertEqual(device_job.state, 'dry_run')
        self.assertIn('POST /add_device', device_job.response)
        self.assertIn(IMEI, device_job.response)

    def test_02_live_creates_the_device_once_and_stores_the_platform_id(self):
        self._setup('live')
        dev = self._install_tracker()
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            self.Job.search([]).sorted('id').process()
            created = [d for d in fake.devices.values() if d['imei'] == IMEI]
            self.assertEqual(len(created), 1)
            dev.invalidate_recordset()
            self.assertEqual(dev.itz_platform_device_id, str(created[0]['id']))
            self.assertEqual(dev.itz_vehicle_id.itz_platform_vehicle_id, str(created[0]['id']))
            self.assertEqual(created[0]['plate_number'], dev.itz_vehicle_id.plate)
            self.assertEqual(created[0]['object_owner'], self.customer.name)
            self.assertEqual(fake.logins, 1)        # one sign-in is reused for every call
            # the service job pushed the subscription expiry date
            self.assertTrue(created[0]['expiration_date'])
            # sending the same device again edits it, it never creates a duplicate
            job = self.Job.search([('operation', '=', 'device')], limit=1)
            job.action_retry()
            job.process()
            self.assertEqual(len([d for d in fake.devices.values() if d['imei'] == IMEI]), 1)
        self.assertNotIn(('POST', '/admin/client'), fake.paths())        # customers are not created by default
        self.assertEqual(self.Job.search([('operation', '=', 'vehicle')]).mapped('state'), ['skipped'] * len(self.Job.search([('operation', '=', 'vehicle')])))

    def test_03_existing_device_in_the_platform_is_adopted_not_duplicated(self):
        self._setup('live')
        self._install_tracker()
        fake = FakeGpswox()
        fake.devices[7] = {'id': 7, 'name': 'old name', 'imei': IMEI, 'expiration_date': None, 'active': True}
        with patch(REQUEST, side_effect=fake):
            self.Job.search([('operation', '=', 'device')]).process()
        self.assertEqual(len(fake.devices), 1)
        self.assertNotIn(('POST', '/add_device'), fake.paths())
        self.assertEqual(fake.devices[7]['plate_number'], self.env['itz.vehicle'].search([], limit=1, order='id desc').plate)

    def test_04_signs_in_again_when_the_platform_rejects_the_saved_key(self):
        self._setup('live', gpswox_hash='STALE')
        self._install_tracker()
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            self.Job.search([('operation', '=', 'device')]).process()
        self.assertEqual(self.Job.search([('operation', '=', 'device')]).mapped('state'), ['done'])
        self.assertEqual(fake.logins, 1)
        self.assertEqual(self.cfg.sudo().gpswox_hash, 'HASH-1')

    def test_05_wrong_service_account_fails_without_retry(self):
        self._setup('live', gpswox_password='nope')
        self._install_tracker()
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            job = self.Job.search([('operation', '=', 'device')], limit=1)
            job.process()
        self.assertEqual(job.state, 'failed')
        self.assertIn('refused the service account', job.last_error)
        self.assertFalse(fake.devices)

    def test_06_customer_accounts_only_when_switched_on(self):
        self._setup('live', gpswox_create_clients=True)
        self.customer.write({'email': 'fleet@example.com'})
        self.Job.search([]).unlink()
        veh = self.env['itz.vehicle'].create({'plate': 'KDB 556C', 'partner_id': self.customer.id})
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            self.Job.search([('operation', '=', 'customer')]).process()
            self.assertEqual(len(fake.clients), 1)
            self.Job.search([('operation', '=', 'customer')]).action_retry()
            self.Job.search([('operation', '=', 'customer')]).process()
            self.assertEqual(len(fake.clients), 1)       # found by email, not created twice
        self.customer.invalidate_recordset()
        self.assertTrue(self.customer.itz_platform_customer_id)
        self.assertTrue(veh)

    def test_07_deactivation_only_when_switched_on(self):
        self._setup('live', gpswox_deactivate_expired=True)
        dev = self._install_tracker()
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            self.Job.search([]).sorted('id').process()
        created = [d for d in fake.devices.values() if d['imei'] == IMEI][0]
        self.assertTrue(created['active'])               # subscription is active, so the device is kept on
        self.assertIn(('POST', '/admin/device/%s/status' % created['id']), fake.paths())

    def test_08_test_connection(self):
        self._setup('dry_run')
        fake = FakeGpswox()
        with patch(REQUEST, side_effect=fake):
            ok, message = self.env['itz.platform.adapter'].adapter_for(self.cfg).ping()
        self.assertTrue(ok, message)
        self._setup('dry_run', gpswox_password='bad')
        with patch(REQUEST, side_effect=fake):
            ok, message = self.env['itz.platform.adapter'].adapter_for(self.cfg).ping()
        self.assertFalse(ok)
