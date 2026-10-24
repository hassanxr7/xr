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


class ItzPlatformAdapter(models.AbstractModel):
    _name = 'itz.platform.adapter'
    _description = 'Platform adapter factory'

    @api.model
    def adapter_for(self, config):
        if config.mode == 'mock':
            return MockAdapter(config)
        return GenericRestAdapter(config)
