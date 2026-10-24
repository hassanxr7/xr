#!/usr/bin/env python3
"""A tiny stand-in for the ITrackZen tracking platform's integration endpoint.

Use it to test the management system's connection before touching the real platform:
  - checks the HMAC signature (header X-ITZ-Signature) and the API key,
  - answers the four endpoints with platform ids (customers, vehicles, devices, services),
  - honours the Idempotency-Key header (the same key twice returns the same answer, nothing is created twice),
  - can send a signed webhook back to the management system.

    SECRET=<signing secret> API_KEY=<token> python3 mock_platform.py serve --port 9090
    SECRET=<signing secret> python3 mock_platform.py webhook --url http://127.0.0.1:8069/itz/platform/webhook \
        --event-id evt-1 --imei 356307040000050 --plate "KDA 123A" --device-id D-1 --vehicle-id V-1 --customer-id C-1

It is also the reference for what the real platform-side integration layer must do (see docs/integration-contract.md).
"""
import argparse
import hashlib
import hmac
import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get('SECRET', '')
API_KEY = os.environ.get('API_KEY', '')
LOG = os.environ.get('LOG', 'mock_platform.log.jsonl')
STATE = {'seen': {}, 'next': {'customers': 100, 'vehicles': 200, 'devices': 300, 'services': 400}, 'by_external': {}}


def sign(body: bytes) -> str:
    return hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


class Handler(BaseHTTPRequestHandler):
    server_version = 'MockPlatform/1.0'

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _auth(self, body):
        if API_KEY and self.headers.get('Authorization') != 'Bearer ' + API_KEY:
            return 'bad api key'
        if SECRET and not hmac.compare_digest(sign(body), self.headers.get('X-ITZ-Signature', '')):
            return 'bad signature'
        return None

    def do_GET(self):
        if self.path.startswith('/ping'):
            err = self._auth(b'')
            return self._send(401 if err else 200, {'error': err} if err else {'ok': True})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        err = self._auth(body)
        if err:
            return self._send(401, {'error': err})
        kind = self.path.strip('/').split('?')[0]
        if kind not in STATE['next']:
            return self._send(404, {'error': 'unknown endpoint'})
        key = self.headers.get('Idempotency-Key', '')
        if key and key in STATE['seen']:
            return self._send(200, dict(STATE['seen'][key], replay=True))
        payload = json.loads(body or b'{}')
        ext = payload.get('external_id')
        # same external id = same object (update), never a duplicate
        if ext and (kind, ext) in STATE['by_external']:
            pid = STATE['by_external'][(kind, ext)]
        else:
            STATE['next'][kind] += 1
            pid = '%s-%d' % (kind[:1].upper(), STATE['next'][kind])
            if ext:
                STATE['by_external'][(kind, ext)] = pid
        answer = {'id': pid}
        if key:
            STATE['seen'][key] = answer
        with open(LOG, 'a') as fh:
            fh.write(json.dumps({'endpoint': kind, 'key': key, 'payload': payload, 'answer': answer}) + '\n')
        self._send(200, answer)

    def log_message(self, fmt, *args):
        sys.stderr.write('mock-platform: ' + fmt % args + '\n')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('serve')
    s.add_argument('--port', type=int, default=9090)
    w = sub.add_parser('webhook')
    w.add_argument('--url', required=True)
    w.add_argument('--event-id', required=True)
    w.add_argument('--type', default='object.created')
    w.add_argument('--imei')
    w.add_argument('--plate')
    w.add_argument('--device-id')
    w.add_argument('--vehicle-id')
    w.add_argument('--customer-id')
    w.add_argument('--email')
    args = ap.parse_args()
    if args.cmd == 'serve':
        HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
    else:
        data = {k: v for k, v in dict(imei=args.imei, plate=args.plate, device_id=args.device_id, vehicle_id=args.vehicle_id,
                                      customer_id=args.customer_id, email=args.email).items() if v}
        body = json.dumps({'id': args.event_id, 'type': args.type, 'data': data}).encode()
        req = urllib.request.Request(args.url, data=body, headers={'Content-Type': 'application/json', 'X-ITZ-Signature': sign(body)})
        print(urllib.request.urlopen(req).read().decode())


if __name__ == '__main__':
    main()
