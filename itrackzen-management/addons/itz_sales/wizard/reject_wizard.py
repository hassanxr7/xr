from odoo import fields, models


class ItzRejectWizard(models.TransientModel):
    _name = 'itz.reject.wizard'
    _description = 'Reject quotation'

    order_id = fields.Many2one('sale.order', required=True)
    reason = fields.Text(required=True)

    def action_confirm(self):
        self.order_id.action_itz_reject(self.reason)
        return {'type': 'ir.actions.act_window_close'}
