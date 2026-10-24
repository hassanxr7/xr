from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    itz_auto_post_renewals = fields.Boolean(string='Post renewal invoices automatically', default=True)
    itz_auto_suspend = fields.Boolean(string='Mark subscription as expired after the grace period', default=True)
