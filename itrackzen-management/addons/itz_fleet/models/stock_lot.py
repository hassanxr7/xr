from odoo import fields, models


class StockLot(models.Model):
    _inherit = 'stock.lot'

    itz_vehicle_id = fields.Many2one('itz.vehicle', string='Installed on vehicle', copy=False, index=True, ondelete='set null', tracking=True)
    itz_vehicle_plate = fields.Char(related='itz_vehicle_id.plate', string='Vehicle plate', store=True)
    itz_customer_id = fields.Many2one('res.partner', related='itz_vehicle_id.partner_id', string='Customer', store=True)
