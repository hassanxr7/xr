from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    itz_approval_required = fields.Boolean(
        string='Require approval before confirming quotations', default=True,
        help='When enabled, a quotation must be approved by a user with the approver privilege before it can become a sales order.')
    itz_approval_threshold = fields.Monetary(
        string='Approval needed from amount', default=0.0,
        help='Quotations below this total are confirmed without approval. Use 0 to require approval for every quotation.')
    itz_require_customer_confirmation = fields.Boolean(
        string='Require customer confirmation to complete an installation', default=True)
    itz_require_photos = fields.Boolean(string='Require at least one photo to complete an installation', default=False)
    itz_reminder_days = fields.Integer(string='Renewal reminder (days before renewal)', default=14)
    itz_grace_days = fields.Integer(string='Grace period after renewal date (days)', default=7)
    itz_invoice_lead_days = fields.Integer(string='Create renewal invoice (days before renewal)', default=14)
    itz_low_stock_notify_email = fields.Char(string='Low-stock alert email')
