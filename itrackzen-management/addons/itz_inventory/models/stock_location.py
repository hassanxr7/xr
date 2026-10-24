from odoo import fields, models


class StockLocation(models.Model):
    _inherit = 'stock.location'

    itz_technician_user_id = fields.Many2one('res.users', string='Technician', index=True, copy=False,
                                             help='Set on personal stock locations of installation technicians.')
