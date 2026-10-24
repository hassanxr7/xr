from odoo import fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    itz_subscription_id = fields.Many2one('itz.subscription', string='Subscription', copy=False, index=True, ondelete='set null')

    def _invoice_paid_hook(self):
        res = super()._invoice_paid_hook()
        Period = self.env['itz.subscription.period'].sudo()
        for move in self:
            periods = Period.search([('invoice_id', '=', move.id), ('paid_date', '=', False)])
            periods._on_invoice_paid()
        return res
