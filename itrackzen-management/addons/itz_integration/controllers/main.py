import json
import logging

from odoo import SUPERUSER_ID, http, _
from odoo.http import request

_logger = logging.getLogger(__name__)


class ItzPlatformController(http.Controller):

    # ---- Inbound webhook from the tracking platform (HMAC signed, idempotent)
    @http.route('/itz/platform/webhook', type='http', auth='none', methods=['POST'], csrf=False, save_session=False, readonly=False)
    def webhook(self, **kw):
        body = request.httprequest.get_data()
        env = request.env(user=SUPERUSER_ID)
        cfg = env['itz.platform.config'].search([], limit=1)
        signature = request.httprequest.headers.get('X-ITZ-Signature', '')
        if not cfg or cfg.mode in ('disabled',) or not cfg.verify(body, signature):
            return request.make_json_response({'error': 'unauthorized'}, status=401)
        try:
            event = json.loads(body.decode() or '{}')
        except ValueError:
            return request.make_json_response({'error': 'invalid json'}, status=400)
        if cfg.mode == 'dry_run':
            _logger.info('ITZ platform webhook (dry run): %s', event.get('type'))
            return request.make_json_response({'status': 'dry_run'})
        result = env['itz.platform.event'].ingest(event)
        return request.make_json_response(result)

    # ---- Deep links from the tracking platform into the management system
    def _redirect_record(self, model, record_id):
        action = {
            'itz.vehicle': 'itz_fleet.action_itz_vehicles', 'res.partner': 'contacts.action_contacts',
            'stock.lot': 'itz_inventory.action_itz_devices',
        }[model]
        return request.redirect('/odoo/action-%s/%s' % (action, record_id))

    @http.route('/itz/go/vehicle', type='http', auth='user', methods=['GET'])
    def go_vehicle(self, plate=None, imei=None, platform_id=None, **kw):
        Vehicle = request.env['itz.vehicle']
        veh = Vehicle
        if platform_id:
            veh = Vehicle.search([('itz_platform_vehicle_id', '=', platform_id)], limit=1)
        if not veh and imei:
            veh = Vehicle.search([('device_ids.itz_imei', '=', imei)], limit=1)
        if not veh and plate:
            norm = ''.join(ch for ch in plate.upper() if ch.isalnum())
            veh = Vehicle.search([('plate_norm', '=', norm)], limit=1)
        if not veh:
            return request.redirect('/odoo/action-itz_fleet.action_itz_vehicles')
        return self._redirect_record('itz.vehicle', veh.id)

    @http.route('/itz/go/customer', type='http', auth='user', methods=['GET'])
    def go_customer(self, platform_id=None, email=None, phone=None, **kw):
        Partner = request.env['res.partner']
        partner = Partner
        if platform_id:
            partner = Partner.search([('itz_platform_customer_id', '=', platform_id)], limit=1)
        if not partner and email:
            partner = Partner.search([('email', '=ilike', email), ('parent_id', '=', False)], limit=1)
        if not partner and phone:
            partner = Partner.search([('phone', '=', phone), ('parent_id', '=', False)], limit=1)
        if not partner:
            return request.redirect('/odoo/action-contacts.action_contacts')
        return self._redirect_record('res.partner', partner.id)

    @http.route('/itz/go/device', type='http', auth='user', methods=['GET'])
    def go_device(self, imei=None, platform_id=None, **kw):
        Lot = request.env['stock.lot']
        lot = Lot
        if platform_id:
            lot = Lot.search([('itz_platform_device_id', '=', platform_id)], limit=1)
        if not lot and imei:
            lot = Lot.search([('itz_imei', '=', imei)], limit=1)
        if not lot:
            return request.redirect('/odoo/action-itz_inventory.action_itz_devices')
        return self._redirect_record('stock.lot', lot.id)
