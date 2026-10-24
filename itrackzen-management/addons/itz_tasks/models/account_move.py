from odoo import models, _


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _invoice_paid_hook(self):
        res = super()._invoice_paid_hook()
        tasks = self.env['itz.task'].sudo().search([('invoice_id', 'in', self.ids), ('task_type', '=', 'payment_collection'),
                                                    ('state', 'in', ('pending', 'in_progress'))])
        tasks.write({'state': 'completed', 'date_done': self.env.cr.now(), 'result_note': _('Invoice paid.')})
        return res
