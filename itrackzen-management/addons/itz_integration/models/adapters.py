import json
import logging
import uuid

import requests

from odoo import api, models

_logger = logging.getLogger(__name__)


class AdapterError(Exception):
    """Raised by adapters. `retry` says whether trying again can help."""

    def __init__(self, message, retry=True):
        super().__init__(message)
        self.retry = retry


class BaseAdapter:
    def __init__(self, config):
        self.config = config

    def ping(self):
        raise NotImplementedError

    def send(self, endpoint, payload, idempotency_key):
        """POST payload. Returns the parsed JSON response (dict)."""
        raise NotImplementedError


class MockAdapter(BaseAdapter):
    """Staging simulator: accepts everything and returns predictable platform ids. Nothing leaves the server."""

    def ping(self):
        return True, 'Staging simulator is active: no real request was sent.'

    def send(self, endpoint, payload, idempotency_key):
        key = payload.get('external_id') or idempotency_key
        return {'id': 'SIM-%s' % uuid.uuid5(uuid.NAMESPACE_URL, 'itz/%s/%s' % (endpoint, key)).hex[:10], 'simulated': True}


class GenericRestAdapter(BaseAdapter):
    """JSON over HTTPS. The request body is signed with HMAC-SHA256 (header X-ITZ-Signature)."""

    def _url(self, endpoint):
        base = (self.config.api_base_url or '').rstrip('/')
        return base + '/' + endpoint.lstrip('/')

    def _headers(self, body, idempotency_key):
        cfg = self.config
        headers = {
            'Content-Type': 'application/json', 'Accept': 'application/json',
            'X-ITZ-Signature': cfg.sign(body), 'Idempotency-Key': idempotency_key, 'User-Agent': 'ITrackZen-Management/1.0',
        }
        key = cfg.sudo().api_key
        if cfg.auth_type == 'bearer' and key:
            headers['Authorization'] = 'Bearer %s' % key
        elif cfg.auth_type == 'header' and key:
            headers[cfg.auth_header or 'X-API-Key'] = key
        return headers

    def _auth(self):
        if self.config.auth_type == 'basic' and self.config.sudo().api_key and ':' in self.config.sudo().api_key:
            user, _sep, password = self.config.sudo().api_key.partition(':')
            return (user, password)
        return None

    def ping(self):
        if not self.config.api_base_url:
            return False, self.config.env._('Enter the platform API address first.')
        try:
            resp = requests.get(self._url('/ping'), headers=self._headers(b'', 'ping'), auth=self._auth(), timeout=self.config.timeout or 15)
        except requests.RequestException as exc:
            return False, self.config.env._('Cannot reach the platform: %s', exc)
        if resp.status_code == 404:
            return True, self.config.env._('The platform answered (HTTP 404 on /ping). The server is reachable; the /ping route is optional.')
        if resp.ok:
            return True, self.config.env._('Connected (HTTP %s).', resp.status_code)
        return False, self.config.env._('The platform answered with HTTP %s.', resp.status_code)

    def send(self, endpoint, payload, idempotency_key):
        body = json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str).encode()
        try:
            resp = requests.post(self._url(endpoint), data=body, headers=self._headers(body, idempotency_key),
                                 auth=self._auth(), timeout=self.config.timeout or 15)
        except requests.RequestException as exc:
            raise AdapterError('Network error: %s' % exc, retry=True)
        if resp.status_code >= 500 or resp.status_code in (408, 429):
            raise AdapterError('Platform error HTTP %s: %s' % (resp.status_code, resp.text[:300]), retry=True)
        if resp.status_code >= 400:
            raise AdapterError('Platform rejected the request (HTTP %s): %s' % (resp.status_code, resp.text[:300]), retry=False)
        try:
            return resp.json() if resp.content else {}
        except ValueError:
            return {}


class GpswoxAdapter(BaseAdapter):
    """Talks to a GPS-Server / GPSWOX platform through its own API (documented at gpswox.stoplight.io).

    Sign-in: POST {api}/login (email, password) returns `user_api_hash`, which goes into every later request as a query
    parameter. The hash is kept on the connection record and renewed automatically when the platform rejects it.
    In GPSWOX a "vehicle" is a device (object), so vehicles are sent together with their tracker:
      customer -> client account (only if enabled), device -> add_device / edit_device (+ assign to client),
      service  -> admin/device/{id}/expiration (and, only if enabled, admin/device/{id}/status).
    """

    def _base(self):
        return (self.config.api_base_url or '').rstrip('/')

    def _login(self):
        cfg = self.config.sudo()
        if not (cfg.gpswox_email and cfg.gpswox_password):
            raise AdapterError('Enter the platform service account email and password first.', retry=False)
        try:
            resp = requests.request('POST', self._base() + '/login', data={'email': cfg.gpswox_email, 'password': cfg.gpswox_password},
                                    timeout=cfg.timeout or 15)
        except requests.RequestException as exc:
            raise AdapterError('Network error: %s' % exc, retry=True)
        try:
            body = resp.json() if resp.content else {}
        except ValueError:
            body = {}
        if resp.status_code >= 500:
            raise AdapterError('Platform error HTTP %s' % resp.status_code, retry=True)
        if resp.status_code >= 400 or not body.get('user_api_hash'):
            raise AdapterError('The platform refused the service account (%s).' % (body.get('message') or 'HTTP %s' % resp.status_code), retry=False)
        cfg.write({'gpswox_hash': body['user_api_hash']})
        return body['user_api_hash']

    def _call(self, method, path, params=None, body=None, _retry_auth=True):
        cfg = self.config.sudo()
        api_hash = cfg.gpswox_hash or self._login()
        query = dict(params or {}, lang='en', user_api_hash=api_hash)
        try:
            resp = requests.request(method, self._base() + '/' + path.lstrip('/'), params=query, json=body, timeout=cfg.timeout or 15,
                                    headers={'Accept': 'application/json', 'User-Agent': 'ITrackZen-Management/1.0'})
        except requests.RequestException as exc:
            raise AdapterError('Network error: %s' % exc, retry=True)
        if resp.status_code in (401, 403) and _retry_auth:
            cfg.write({'gpswox_hash': False})
            return self._call(method, path, params, body, _retry_auth=False)
        if resp.status_code >= 500 or resp.status_code in (408, 429):
            raise AdapterError('Platform error HTTP %s: %s' % (resp.status_code, resp.text[:300]), retry=True)
        try:
            data = resp.json() if resp.content else {}
        except ValueError:
            data = {}
        if resp.status_code >= 400 or (isinstance(data, dict) and data.get('status') == 0):
            raise AdapterError('Platform rejected the request (HTTP %s): %s' % (resp.status_code, str(data)[:300] or resp.text[:300]), retry=False)
        return data

    def ping(self):
        if not self.config.api_base_url:
            return False, self.config.env._('Enter the platform API address first, for example https://your-platform/api')
        try:
            self._login()
            self._call('GET', '/admin/devices', {'limit': 1})
        except AdapterError as exc:
            return False, str(exc)
        return True, self.config.env._('Connected: signed in and the administrator device list can be read.')

    # --------------------------------------------------------------- lookups (avoid duplicates)
    def _find_device(self, imei):
        data = self._call('GET', '/admin/devices', {'s': imei, 'property': 'imei', 'limit': 20})
        for item in (data.get('data') or []):
            if str(item.get('imei') or '').strip() == str(imei).strip():
                return item
        return None

    def _find_client(self, email):
        data = self._call('GET', '/admin/clients', {'search_phrase': email, 'limit': 20})
        rows = data.get('data') or data.get('items') or []
        for item in rows if isinstance(rows, list) else []:
            if str(item.get('email') or '').strip().lower() == email.strip().lower():
                return item
        return None

    # --------------------------------------------------------------- operations
    @staticmethod
    def _operation(payload):
        ext = str(payload.get('external_id') or '')
        return {'cus': 'customer', 'veh': 'vehicle', 'dev': 'device', 'sub': 'service'}.get(ext.split('-')[0])

    def plan(self, payload):
        """Human-readable list of the platform calls a payload would cause (used by Dry run)."""
        op = self._operation(payload)
        cfg = self.config
        if op == 'customer':
            if not cfg.gpswox_create_clients:
                return ['No call: customer accounts are not created in the tracking platform (switched off).']
            return ['GET /admin/clients?search_phrase=<email>', 'POST /admin/client  (or PUT /admin/client when it already exists)',
                    'body: email=%s phone_number=%s' % (payload.get('email'), payload.get('phone'))]
        if op == 'vehicle':
            return ['No call: a vehicle is a device in the tracking platform; it is sent together with its tracker.']
        if op == 'device':
            if payload.get('status') != 'installed' or not payload.get('plate'):
                return ['No call yet: the device is sent when it is installed on a vehicle.']
            return ['GET /admin/devices?s=%s&property=imei' % payload.get('imei'), 'POST /add_device  (or POST /edit_device when it exists)',
                    'body: name=%s imei=%s plate_number=%s sim_number=%s object_owner=%s' % (
                        payload.get('plate'), payload.get('imei'), payload.get('plate'), (payload.get('sim') or {}).get('msisdn'), payload.get('customer_name'))] + (
                ['POST /admin/device/<id>/user  user_id=<client>'] if cfg.gpswox_create_clients and payload.get('customer_id') else [])
        if op == 'service':
            calls = []
            if cfg.gpswox_push_expiry and payload.get('expires_on'):
                calls.append('POST /admin/device/<id of %s>/expiration  expiration_date=%s' % (payload.get('device_imei'), payload.get('expires_on')))
            if cfg.gpswox_deactivate_expired:
                calls.append('POST /admin/device/<id>/status  active=%s' % (1 if payload.get('status') == 'active' else 0))
            return calls or ['No call: expiry and status updates are switched off.']
        return ['No call.']

    def send(self, endpoint, payload, idempotency_key):
        op = self._operation(payload)
        cfg = self.config
        if op == 'customer':
            return self._send_customer(payload)
        if op == 'vehicle':
            return {'noop': 'A vehicle is a device in the tracking platform; it is sent together with its tracker.'}
        if op == 'device':
            return self._send_device(payload)
        if op == 'service':
            return self._send_service(payload)
        raise AdapterError('Unknown operation for %s' % payload.get('external_id'), retry=False)

    def _send_customer(self, payload):
        cfg = self.config
        if not cfg.gpswox_create_clients:
            return {'noop': 'Customer accounts are not created in the tracking platform (switched off in the connection settings).'}
        email = (payload.get('email') or '').strip()
        if not email:
            raise AdapterError('The customer needs an email address before an account can be created in the tracking platform.', retry=False)
        client_id = payload.get('platform_id')
        if not client_id:
            found = self._find_client(email)
            client_id = found and found.get('id')
        if client_id:
            self._call('PUT', '/admin/client', body={'id': int(client_id), 'email': email, 'phone_number': payload.get('phone') or ''})
            return {'id': client_id}
        data = self._call('POST', '/admin/client', body={
            'active': True, 'email': email, 'phone_number': payload.get('phone') or '', 'password_generate': True,
            'email_verification': False, 'account_created': False})
        client_id = (data.get('item') or {}).get('id') or data.get('id')
        if not client_id:
            raise AdapterError('The platform did not return the new account id.', retry=True)
        return {'id': client_id}

    def _send_device(self, payload):
        cfg = self.config
        imei = (payload.get('imei') or '').strip()
        if payload.get('status') != 'installed' or not payload.get('plate'):
            return {'noop': 'The device is created in the tracking platform when it is installed on a vehicle.'}
        if not imei:
            raise AdapterError('The tracker has no IMEI.', retry=False)
        fields_ = {'name': payload['plate'], 'imei': imei, 'plate_number': payload['plate'], 'object_owner': payload.get('customer_name') or ''}
        sim = payload.get('sim') or {}
        if sim.get('msisdn'):
            fields_['sim_number'] = sim['msisdn']
        device_id = payload.get('platform_id')
        if not device_id:
            found = self._find_device(imei)
            device_id = found and found.get('id')
        if device_id:
            self._call('POST', '/edit_device', {'device_id': int(device_id)}, fields_)
        else:
            data = self._call('POST', '/add_device', None, fields_)
            device_id = data.get('id')
            if not device_id:
                raise AdapterError('The platform did not return the new device id.', retry=True)
        if cfg.gpswox_create_clients and payload.get('customer_id'):
            self._call('POST', '/admin/device/%s/user' % device_id, None, {'user_id': int(payload['customer_id'])})
        return {'id': device_id, 'vehicle_platform_id': device_id}

    def _send_service(self, payload):
        cfg = self.config
        if not (cfg.gpswox_push_expiry or cfg.gpswox_deactivate_expired):
            return {'noop': 'Expiry and status updates are switched off in the connection settings.'}
        imei = (payload.get('device_imei') or '').strip()
        if not imei:
            return {'noop': 'The vehicle has no tracker yet.'}
        found = self._find_device(imei)
        if not found:
            raise AdapterError('The tracker %s is not in the tracking platform yet.' % imei, retry=True)
        device_id = found['id']
        if cfg.gpswox_push_expiry and payload.get('expires_on'):
            self._call('POST', '/admin/device/%s/expiration' % device_id, None, {'expiration_date': payload['expires_on']})
        if cfg.gpswox_deactivate_expired:
            self._call('POST', '/admin/device/%s/status' % device_id, None, {'active': 1 if payload.get('status') == 'active' else 0})
        return {'id': device_id}


class ItzPlatformAdapter(models.AbstractModel):
    _name = 'itz.platform.adapter'
    _description = 'Platform adapter factory'

    @api.model
    def adapter_for(self, config):
        if config.mode == 'mock':
            return MockAdapter(config)
        if config.platform_type == 'gpswox':
            return GpswoxAdapter(config)
        return GenericRestAdapter(config)
