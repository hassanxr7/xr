#!/usr/bin/env python3
"""Small stand-in for the GPSWOX API (only the calls the ITrackZen adapter makes), for testing without touching the real platform.

    python3 mock_gpswox.py 8091        # then set the API address to http://127.0.0.1:8091/api in the connection settings
Service account: svc@itrackzen.net / pw. Everything is kept in memory. Behaviour follows the GPSWOX API reference.
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

HASH = 'MOCK-HASH'
STATE = {'devices': {}, 'clients': {}, 'next': 100}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _handle(self, method):
        url = urlparse(self.path)
        path = re.sub(r'^/api', '', url.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length).decode() if length else ''
        ctype = self.headers.get('Content-Type', '')
        body = json.loads(raw) if raw and 'json' in ctype else {k: v[0] for k, v in parse_qs(raw).items()}
        print(method, path, {k: v for k, v in query.items() if k != 'user_api_hash'}, body, flush=True)
        if path == '/login':
            if body.get('email') == 'svc@itrackzen.net' and body.get('password') == 'pw':
                return self._send(200, {'status': 1, 'user_api_hash': HASH, 'permissions': {}})
            return self._send(401, {'status': 0, 'message': 'Wrong credentials'})
        if query.get('user_api_hash') != HASH:
            return self._send(401, {'status': 0, 'message': 'Unauthorized'})
        if method == 'GET' and path == '/admin/devices':
            rows = [d for d in STATE['devices'].values() if query.get('s', '') in (d.get('imei') or '')]
            return self._send(200, {'status': 1, 'data': rows, 'pagination': {'total': len(rows)}})
        if method == 'POST' and path == '/add_device':
            if any(d['imei'] == body.get('imei') for d in STATE['devices'].values()):
                return self._send(400, {'status': 0, 'errors': {'imei': ['The imei has already been taken.']}})
            STATE['next'] += 1
            STATE['devices'][STATE['next']] = dict(body, id=STATE['next'], active=True, expiration_date=None)
            return self._send(200, {'status': 1, 'id': STATE['next']})
        if method == 'POST' and path == '/edit_device':
            STATE['devices'][int(query['device_id'])].update(body)
            return self._send(200, {'status': 1})
        m = re.match(r'/admin/device/(\d+)/(user|expiration|status)$', path)
        if method == 'POST' and m:
            dev = STATE['devices'][int(m.group(1))]
            dev[{'user': 'user_id', 'expiration': 'expiration_date', 'status': 'active'}[m.group(2)]] = list(body.values())[0]
            return self._send(200, {'status': 1})
        if method == 'GET' and path == '/admin/clients':
            return self._send(200, {'status': 1, 'data': list(STATE['clients'].values())})
        if path == '/admin/client' and method in ('POST', 'PUT'):
            if method == 'POST':
                STATE['next'] += 1
                STATE['clients'][STATE['next']] = dict(body, id=STATE['next'])
                return self._send(200, {'status': 1, 'item': {'id': STATE['next']}})
            STATE['clients'][body['id']].update(body)
            return self._send(200, {'status': 1})
        if path == '/state':
            return self._send(200, STATE)
        return self._send(404, {'status': 0})

    do_GET = lambda self: self._handle('GET')      # noqa: E731
    do_POST = lambda self: self._handle('POST')    # noqa: E731
    do_PUT = lambda self: self._handle('PUT')      # noqa: E731

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
    print('Mock GPSWOX on http://127.0.0.1:%s/api  (svc@itrackzen.net / pw)' % port, flush=True)
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()
