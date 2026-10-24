import json

from odoo import api, fields, models, _


class ItzPlatformEvent(models.Model):
    """Events received from the tracking platform (webhook). Used to link IDs; never creates customers or vehicles by itself."""
    _name = 'itz.platform.event'
    _description = 'Platform event'
    _order = 'id desc'

    event_id = fields.Char(required=True, index=True, copy=False)
    event_type = fields.Char(index=True)
    payload = fields.Text()
    state = fields.Selection([('matched', 'Linked'), ('unmatched', 'Needs review'), ('ignored', 'Ignored')], default='unmatched', index=True)
    note = fields.Char()
    res_model = fields.Char()
    res_id = fields.Integer()
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)

    _sql_constraints = [('event_unique', 'unique(event_id)', 'Event already received.')]

    @api.model
    def ingest(self, event):
        """Process one event dict. Idempotent on event['id']."""
        event_id = str(event.get('id') or '')
        if not event_id:
            return {'status': 'error', 'message': 'missing event id'}
        existing = self.sudo().search([('event_id', '=', event_id)], limit=1)
        if existing:
            return {'status': 'duplicate'}
        etype = event.get('type', '')
        data = event.get('data') or {}
        rec = self.sudo().create({'event_id': event_id, 'event_type': etype, 'payload': json.dumps(event, default=str)[:20000]})
        matched = self._link_ids(data)
        if matched:
            rec.write({'state': 'matched', 'res_model': matched._name, 'res_id': matched.id, 'note': matched.display_name})
        else:
            rec.write({'state': 'unmatched', 'note': _('No matching record. Review and link manually.')})
        return {'status': rec.state}

    def _link_ids(self, data):
        """Attach platform IDs to existing records (matched by IMEI, plate or external_id). Never overwrites a different existing ID."""
        Lot, Vehicle, Partner = self.env['stock.lot'].sudo(), self.env['itz.vehicle'].sudo(), self.env['res.partner'].sudo()
        ctx = {'itz_platform_internal': True}
        found = False
        if data.get('imei') and data.get('device_id'):
            lot = Lot.search([('itz_imei', '=', str(data['imei']))], limit=1)
            if lot and not lot.itz_platform_device_id:
                lot.with_context(**ctx).write({'itz_platform_device_id': str(data['device_id']), 'itz_platform_synced_at': fields.Datetime.now()})
                found = lot
            elif lot:
                found = lot
        ext = str(data.get('external_id') or '')
        if data.get('vehicle_id'):
            veh = Vehicle
            if ext.startswith('veh-') and ext[4:].isdigit():
                veh = Vehicle.browse(int(ext[4:])).exists()
            if not veh and data.get('plate'):
                veh = Vehicle.search([('plate_norm', '=', ''.join(ch for ch in str(data['plate']).upper() if ch.isalnum()))], limit=1)
            if veh and not veh.itz_platform_vehicle_id:
                veh.with_context(**ctx).write({'itz_platform_vehicle_id': str(data['vehicle_id']), 'itz_platform_synced_at': fields.Datetime.now()})
            if veh:
                found = found or veh
        if data.get('customer_id'):
            partner = Partner
            if ext.startswith('cus-') and ext[4:].isdigit():
                partner = Partner.browse(int(ext[4:])).exists()
            if not partner and data.get('email'):
                partner = Partner.search([('email', '=ilike', data['email']), ('parent_id', '=', False)], limit=1)
            if partner and not partner.itz_platform_customer_id:
                partner.with_context(**ctx).write({'itz_platform_customer_id': str(data['customer_id']), 'itz_platform_synced_at': fields.Datetime.now()})
            if partner:
                found = found or partner
        return found or False

    def action_mark_ignored(self):
        self.write({'state': 'ignored'})
