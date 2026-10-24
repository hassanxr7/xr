"""Queue platform sync jobs when the data the platform needs changes in the management system."""
from odoo import api, fields, models

PARTNER_FIELDS = {'name', 'email', 'phone', 'country_id', 'is_company'}
VEHICLE_FIELDS = {'plate', 'make', 'model', 'year', 'vehicle_type', 'vin', 'partner_id', 'active'}
DEVICE_FIELDS = {'itz_imei', 'itz_vehicle_id', 'itz_sim_lot_id', 'itz_state'}


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _itz_is_platform_customer(self):
        return not self.parent_id and (self.itz_vehicle_ids or self.itz_platform_customer_id)

    def write(self, vals):
        res = super().write(vals)
        if PARTNER_FIELDS & set(vals) and not self.env.context.get('itz_platform_internal'):
            for partner in self.filtered(lambda p: p._itz_is_platform_customer()):
                self.env['itz.sync.job'].enqueue('customer', partner, partner._itz_trigger_payload())
        return res

    def _itz_trigger_payload(self):
        return {'name': self.name, 'email': self.email, 'phone': self.phone, 'country': self.country_id.code, 'is_company': self.is_company}


class ItzVehicle(models.Model):
    _inherit = 'itz.vehicle'

    @api.model_create_multi
    def create(self, vals_list):
        vehicles = super().create(vals_list)
        for veh in vehicles:
            veh._itz_enqueue_customer_and_vehicle()
        return vehicles

    def write(self, vals):
        res = super().write(vals)
        if VEHICLE_FIELDS & set(vals) and not self.env.context.get('itz_platform_internal'):
            for veh in self:
                veh._itz_enqueue_customer_and_vehicle(customer=False)
        return res

    def _itz_enqueue_customer_and_vehicle(self, customer=True):
        Job = self.env['itz.sync.job']
        if customer:
            p = self.partner_id
            Job.enqueue('customer', p, p._itz_trigger_payload())
        Job.enqueue('vehicle', self, {'plate': self.plate, 'partner': self.partner_id.id, 'make': self.make, 'model': self.model,
                                      'year': self.year, 'type': self.vehicle_type, 'vin': self.vin, 'active': self.active})


class StockLot(models.Model):
    _inherit = 'stock.lot'

    def write(self, vals):
        res = super().write(vals)
        if DEVICE_FIELDS & set(vals) and not self.env.context.get('itz_platform_internal'):
            for lot in self.filtered(lambda l: l.itz_category in ('tracker', 'dashcam') and l.itz_vehicle_id):
                self.env['itz.sync.job'].enqueue('device', lot, {
                    'imei': lot.itz_imei, 'vehicle': lot.itz_vehicle_id.id, 'sim': lot.itz_sim_lot_id.id, 'state': lot.itz_state})
        return res


class ItzSubscription(models.Model):
    _inherit = 'itz.subscription'

    def _itz_platform_event(self, event):
        res = super()._itz_platform_event(event)
        for sub in self.filtered(lambda s: s.state != 'draft'):
            self.env['itz.sync.job'].enqueue('service', sub, {
                'event': event, 'status': sub.state, 'expires': str(sub.next_renewal_date), 'vehicle': sub.vehicle_id.id})
        return res

    def write(self, vals):
        res = super().write(vals)
        if 'next_renewal_date' in vals and not self.env.context.get('itz_platform_internal'):
            for sub in self.filtered(lambda s: s.state in ('active', 'expired', 'suspended')):
                self.env['itz.sync.job'].enqueue('service', sub, {
                    'event': 'renewal_date', 'status': sub.state, 'expires': str(sub.next_renewal_date), 'vehicle': sub.vehicle_id.id})
        return res
