import base64
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, urlsplit

from odoo import fields
from odoo.tests import HttpCase, tagged
from odoo.addons.itz_inventory.tests.common import ItzCommon

CALLBACK = 'https://itrackzen.net/admin/sso.php'


@tagged('post_install', '-at_install', 'itz')
class TestBridgeModel(ItzCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.cfg = cls.env['itz.website.config'].get_config()
        cls.cfg.sudo().enabled = True

    def test_01_roles_areas_menus(self):
        C = self.cfg
        self.assertEqual(C.roles_of(self.users['owner']), ['owner'])
        self.assertEqual(C.roles_of(self.users['ops']), ['ops_manager'])
        self.assertIn('users', C.areas_of(self.users['owner']))
        self.assertEqual(C.areas_of(self.users['sales']), ['enquiries'])
        self.assertEqual(C.areas_of(self.users['support']), ['deletions', 'enquiries'])
        self.assertEqual(C.areas_of(self.users['tech']), [])
        self.assertEqual(C.areas_of(self.users['accountant']), [])
        tech_menus = {m['label'] for m in C.menus_of(self.users['tech'])}
        self.assertIn('Installations', tech_menus)
        self.assertNotIn('Finance', tech_menus)
        self.assertNotIn('Configuration', tech_menus)
        acc_menus = {m['label'] for m in C.menus_of(self.users['accountant'])}
        self.assertIn('Finance', acc_menus)
        owner_menus = {m['label'] for m in C.menus_of(self.users['owner'])}
        for label in ('Dashboard', 'Sales', 'Finance', 'Inventory', 'Configuration', 'Reports'):
            self.assertIn(label, owner_menus)
        for m in C.menus_of(self.users['owner']):
            self.assertTrue(m['path'].startswith('/odoo/action-'), m)

    def test_02_token_roundtrip_and_tamper(self):
        token = self.cfg.make_login_token(self.users['sales'], 'st4te')
        payload = self.cfg.check_login_token(token)
        self.assertEqual(payload['login'], 'itz_sales')
        self.assertEqual(payload['state'], 'st4te')
        self.assertEqual(payload['areas'], ['enquiries'])
        self.assertLessEqual(payload['exp'] - payload['iat'], 90)
        body, sig = token.split('.')
        evil = json.loads(base64.urlsafe_b64decode(body + '=='))
        evil['areas'] = ['users']
        evil_body = base64.urlsafe_b64encode(json.dumps(evil).encode()).rstrip(b'=').decode()
        self.assertIsNone(self.cfg.check_login_token(evil_body + '.' + sig))
        self.assertIsNone(self.cfg.check_login_token(body + '.' + '0' * 64))

    def test_03_redirect_allow_list(self):
        self.assertTrue(self.cfg.redirect_allowed(CALLBACK))
        self.assertTrue(self.cfg.redirect_allowed(CALLBACK + '?x=1'))
        self.assertFalse(self.cfg.redirect_allowed('https://evil.example/admin/sso.php'))
        self.assertFalse(self.cfg.redirect_allowed(CALLBACK + '.evil.example/'))
        self.assertFalse(self.cfg.redirect_allowed('javascript:alert(1)'))

    def test_04_events_create_enquiry_and_task_idempotently(self):
        E = self.env['itz.website.event']
        event = {'id': 'enq-1', 'type': 'enquiry.created', 'data': {
            'ref': 'ENQ-261024-AB123', 'type': 'quote', 'full_name': 'Ali Hassan', 'company': 'Hassan Haulage', 'email': 'ali@example.com',
            'phone': '+252610000000', 'country': 'Somalia', 'vehicles': '25', 'service': 'GPS Tracking', 'message': 'Need quote',
            'extra': {'plan': 'Standard', 'hardware': 'I need trackers and installation'}}}
        res = E.ingest(event)
        self.assertEqual(res['status'], 'ok')
        enq = self.env['itz.enquiry'].search([('website_ref', '=', 'ENQ-261024-AB123')])
        self.assertEqual(len(enq), 1)
        self.assertEqual(enq.contact_name, 'Ali Hassan')
        self.assertIn('Standard', enq.message)
        self.assertEqual(E.ingest(event)['status'], 'duplicate')
        again = dict(event, id='enq-1b')                    # different event id but same website reference: no second enquiry
        E.ingest(again)
        self.assertEqual(self.env['itz.enquiry'].search_count([('website_ref', '=', 'ENQ-261024-AB123')]), 1)
        E.ingest({'id': 'enq-1c', 'type': 'enquiry.updated', 'data': {'ref': 'ENQ-261024-AB123', 'status': 'spam'}})
        self.assertEqual(enq.state, 'spam')
        # deletion request
        E.ingest({'id': 'del-1', 'type': 'deletion.created', 'data': {'ref': 'DEL-261024-ZZ999', 'status': 'awaiting_review'}})
        task = self.env['itz.task'].search([('name', 'ilike', 'DEL-261024-ZZ999')])
        self.assertEqual(len(task), 1)
        self.assertEqual(task.priority, '3')
        self.assertTrue(task.date_deadline)
        E.ingest({'id': 'del-2', 'type': 'deletion.updated', 'data': {'ref': 'DEL-261024-ZZ999', 'status': 'completed'}})
        self.assertEqual(task.state, 'completed')
        self.assertEqual(E.ingest({'id': 'x1', 'type': 'unknown.thing', 'data': {}})['status'], 'ignored')

    def test_05_only_owner_changes_connection(self):
        from odoo.exceptions import UserError
        with self.assertRaises(UserError):
            self.cfg.with_user(self.users['ops']).write({'enabled': False})


@tagged('post_install', '-at_install', 'itz')
class TestBridgeHttp(HttpCase):

    def setUp(self):
        super().setUp()
        self.cfg = self.env['itz.website.config'].get_config()
        self.cfg.sudo().write({'enabled': True})
        self.env.cr.flush()

    def _signed(self, uid):
        ts = str(int(time.time()))
        sig = self.cfg.sign('summary|%s|%s' % (uid, ts))
        return '/itz/api/summary?uid=%s&ts=%s&sig=%s' % (uid, ts, sig)

    def test_01_authorize_flow(self):
        url = '/itz/sso/authorize?redirect_uri=%s&state=abc123' % CALLBACK
        res = self.url_open(url, allow_redirects=False)
        self.assertIn('/web/login', res.headers['Location'])          # not signed in: Odoo login first
        self.authenticate('admin', 'admin')
        res = self.url_open(url, allow_redirects=False)
        self.assertIn(res.status_code, (302, 303))
        loc = urlsplit(res.headers['Location'])
        self.assertEqual('%s://%s%s' % (loc.scheme, loc.netloc, loc.path), CALLBACK)
        q = parse_qs(loc.query)
        self.assertEqual(q['state'], ['abc123'])
        payload = self.cfg.check_login_token(q['token'][0])
        self.assertEqual(payload['login'], 'admin')
        self.assertEqual(payload['roles'], ['owner'])
        # bad redirect and missing state are refused
        self.assertEqual(self.url_open('/itz/sso/authorize?redirect_uri=https://evil.example/&state=a', allow_redirects=False).status_code, 400)
        self.assertEqual(self.url_open('/itz/sso/authorize?redirect_uri=%s' % CALLBACK, allow_redirects=False).status_code, 400)

    def test_02_disabled_blocks_everything(self):
        self.cfg.sudo().enabled = False
        self.env.cr.flush()
        self.authenticate('admin', 'admin')
        self.assertEqual(self.url_open('/itz/sso/authorize?redirect_uri=%s&state=a' % CALLBACK, allow_redirects=False).status_code, 403)
        self.assertEqual(self.url_open(self._signed(2)).status_code, 403)

    def test_03_summary_is_signed_and_role_limited(self):
        admin = self.env.ref('base.user_admin')
        res = self.url_open(self._signed(admin.id))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['tiles'])
        self.assertTrue(data['menus'])
        self.assertEqual(data['user']['name'], admin.name)
        # forged signature / stale timestamp / unknown user
        self.assertEqual(self.url_open('/itz/api/summary?uid=%s&ts=%s&sig=%s' % (admin.id, int(time.time()), 'bad')).status_code, 401)
        stale = int(time.time()) - 1000
        sig = self.cfg.sign('summary|%s|%s' % (admin.id, stale))
        self.assertEqual(self.url_open('/itz/api/summary?uid=%s&ts=%s&sig=%s' % (admin.id, stale, sig)).status_code, 401)
        self.assertEqual(self.url_open(self._signed(999999)).status_code, 401)

    def test_04_event_endpoint_signature(self):
        body = json.dumps({'id': 'http-1', 'type': 'enquiry.created', 'data': {'ref': 'ENQ-HTTP-1', 'full_name': 'Http Tester', 'email': 'h@example.com'}}).encode()
        bad = self.url_open('/itz/website/event', data=body, headers={'X-ITZ-Signature': 'nope', 'Content-Type': 'application/json'})
        self.assertEqual(bad.status_code, 401)
        ok = self.url_open('/itz/website/event', data=body, headers={'X-ITZ-Signature': self.cfg.sign(body), 'Content-Type': 'application/json'})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()['status'], 'ok')
        self.assertTrue(self.env['itz.enquiry'].search([('website_ref', '=', 'ENQ-HTTP-1')]))

    def test_05_logout_redirects_to_website(self):
        self.authenticate('admin', 'admin')
        res = self.url_open('/itz/sso/logout?redirect=https://itrackzen.net/admin/', allow_redirects=False)
        self.assertEqual(res.headers['Location'], 'https://itrackzen.net/admin/')
        res = self.url_open('/itz/sso/logout?redirect=https://evil.example/', allow_redirects=False)
        self.assertEqual(res.headers['Location'], 'https://itrackzen.net/admin/')


@tagged('post_install', '-at_install', 'itz')
class TestWebsiteCatalog(HttpCase):

    def setUp(self):
        super().setUp()
        self.cfg = self.env['itz.website.config'].get_config()
        self.cfg.sudo().enabled = True
        P = self.env['product.template']
        self.tracker = P.create({'name': 'Web Tracker', 'itz_category': 'tracker', 'type': 'consu', 'is_storable': True, 'list_price': 85.0,
                                 'itz_web_publish': True, 'itz_web_note': '4G tracker with SOS', 'itz_model': 'T100',
                                 'itz_web_features': 'Live tracking\n\n SOS button '})
        self.plan = P.create({'name': 'Web Plan Business', 'itz_category': 'plan', 'type': 'service', 'list_price': 12.0, 'itz_plan_cycle': 'monthly',
                              'itz_web_publish': True, 'itz_web_plan': 'business'})
        self.hidden = P.create({'name': 'Hidden Relay', 'itz_category': 'relay', 'type': 'consu', 'is_storable': True, 'list_price': 30.0})
        self.free = P.create({'name': 'Zero Price Cable', 'itz_category': 'cable', 'type': 'consu', 'list_price': 0.0, 'itz_web_publish': True})

    def _url(self, ts=None, sig=None):
        ts = str(ts or int(time.time()))
        return '/itz/api/catalog?ts=%s&sig=%s' % (ts, sig or self.cfg.sign('catalog|%s' % ts))

    def test_catalog_lists_only_published_priced_products_without_costs(self):
        res = self.url_open(self._url())
        self.assertEqual(res.status_code, 200)
        data = res.json()
        names = {i['name'] for i in data['items']} | {p['name'] for p in data['plans']}
        self.assertIn('Web Tracker', names)
        self.assertIn('Web Plan Business', names)
        self.assertNotIn('Hidden Relay', names)
        self.assertIn('Zero Price Cable', names)                 # hardware needs no price to be shown
        row = next(i for i in data['items'] if i['name'] == 'Web Tracker')
        self.assertNotIn('price', row)                           # hardware is quoted, never priced on the website
        self.assertEqual(row['blurb'], '4G tracker with SOS')
        self.assertEqual(row['features'], ['Live tracking', 'SOS button'])
        self.assertEqual(row['model'], 'T100')
        self.assertFalse(row['in_stock'])                       # nothing received yet
        self.assertNotIn('standard_price', json.dumps(data))
        plan = data['plans'][0]
        self.assertEqual((plan['plan'], plan['cycle'], plan['price']), ('business', 'monthly', 12.0))

    def test_catalog_image_is_signed_and_only_for_published_products(self):
        import base64
        png = base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082'))
        self.tracker.write({'image_1920': png})
        ts = str(int(time.time()))
        good = '/itz/api/catalog/image/%s?ts=%s&sig=%s' % (self.tracker.id, ts, self.cfg.sign('catalog-image|%s|%s' % (self.tracker.id, ts)))
        res = self.url_open(good)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers['Content-Type'], 'image/png')
        row = next(i for i in self.url_open(self._url()).json()['items'] if i['name'] == 'Web Tracker')
        self.assertTrue(row['image'])
        self.assertEqual(self.url_open('/itz/api/catalog/image/%s?ts=%s&sig=bad' % (self.tracker.id, ts)).status_code, 401)
        self.hidden.write({'image_1920': png})
        sig = self.cfg.sign('catalog-image|%s|%s' % (self.hidden.id, ts))
        self.assertEqual(self.url_open('/itz/api/catalog/image/%s?ts=%s&sig=%s' % (self.hidden.id, ts, sig)).status_code, 404)

    def test_catalog_stock_flag_follows_the_store(self):
        cable = self.env['product.template'].create({'name': 'Web Cable', 'itz_category': 'cable', 'type': 'consu', 'is_storable': True,
                                                     'list_price': 4.0, 'itz_web_publish': True})
        find = lambda: next(i for i in self.url_open(self._url()).json()['items'] if i['name'] == 'Web Cable')  # noqa: E731
        self.assertFalse(find()['in_stock'])
        wh = self.env['stock.warehouse'].search([], limit=1)
        self.env['stock.quant'].with_context(inventory_mode=True).create({
            'product_id': cable.product_variant_id.id, 'location_id': wh.lot_stock_id.id, 'inventory_quantity': 3}).action_apply_inventory()
        self.assertTrue(find()['in_stock'])

    def test_catalog_requires_a_valid_signature(self):
        self.assertEqual(self.url_open('/itz/api/catalog?ts=%s&sig=bad' % int(time.time())).status_code, 401)
        old = int(time.time()) - 1000
        self.assertEqual(self.url_open(self._url(ts=old, sig=self.cfg.sign('catalog|%s' % old))).status_code, 401)
        self.cfg.sudo().enabled = False
        self.assertEqual(self.url_open(self._url()).status_code, 403)

    def test_one_published_plan_per_card_and_cycle(self):
        from odoo.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            self.env['product.template'].create({'name': 'Second Business', 'itz_category': 'plan', 'type': 'service', 'list_price': 11.0,
                                                 'itz_plan_cycle': 'monthly', 'itz_web_publish': True, 'itz_web_plan': 'business'})
        with self.assertRaises(ValidationError):
            self.env['product.template'].create({'name': 'Tracker as plan', 'itz_category': 'tracker', 'type': 'consu', 'itz_web_plan': 'starter'})
