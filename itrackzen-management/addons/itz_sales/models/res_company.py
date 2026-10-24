from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    itz_max_discount_pct = fields.Float(
        string='Maximum discount without approval (%)', default=10.0,
        help='A quotation with any line discount above this percentage always needs approval.')
