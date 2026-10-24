from odoo import fields, models


class ItzDeviceEvent(models.Model):
    _inherit = 'itz.device.event'

    vehicle_id = fields.Many2one('itz.vehicle', string='Vehicle', index=True, ondelete='set null')
    plate = fields.Char(related='vehicle_id.plate', store=True)
    installation_id = fields.Many2one('itz.installation', string='Installation job', ondelete='set null')
    partner_id = fields.Many2one('res.partner', related='vehicle_id.partner_id', store=True, string='Customer')
