from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    itz_payment_instructions = fields.Html(
        string='Payment instructions', translate=True,
        help='Bank account, mobile-money numbers and references shown on quotations, invoices and statements.')
    itz_terms_note = fields.Text(string='Document terms', translate=True,
                                 help='Short terms shown below totals on quotations and invoices.')
