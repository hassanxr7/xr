from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    itz_recorded_by_id = fields.Many2one('res.users', string='Recorded by', default=lambda self: self.env.user, readonly=True, copy=False)
    itz_reference = fields.Char(string='Payment reference', help='Transaction ID, mobile-money code, cheque number or bank reference.')

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        for pay in payments:
            if pay.payment_type == 'inbound':
                self.env['itz.audit.log'].log('payment', 'Payment recorded', pay, '%s %s %s via %s' % (pay.partner_id.name, pay.amount, pay.currency_id.name, pay.payment_method_line_id.name or '-'))
        return payments

    def action_post(self):
        res = super().action_post()
        for pay in self:
            self.env['itz.audit.log'].log('payment', 'Payment posted', pay, '%s %s' % (pay.partner_id.name, pay.amount))
        return res

    def action_draft(self):
        for pay in self:
            if pay.state != 'draft' and not self.env.su:
                if not self.env.user.has_group('itz_base.group_itz_approver'):
                    raise UserError(_('Only an approver can reset a posted payment to draft.'))
                self.env['itz.audit.log'].log('payment', 'Payment reset to draft', pay, '%s %s' % (pay.partner_id.name, pay.amount))
        return super().action_draft()

    def action_cancel(self):
        for pay in self:
            if not self.env.su and not self.env.user.has_group('itz_base.group_itz_approver') and pay.state != 'draft':
                raise UserError(_('Only an approver can cancel a posted payment.'))
            self.env['itz.audit.log'].log('payment', 'Payment cancelled', pay, '%s %s' % (pay.partner_id.name, pay.amount))
        return super().action_cancel()
