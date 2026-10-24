from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountMove(models.Model):
    _inherit = 'account.move'

    itz_days_overdue = fields.Integer(string='Days overdue', compute='_compute_itz_overdue', search='_search_itz_days_overdue')
    itz_is_overdue = fields.Boolean(string='Overdue', compute='_compute_itz_overdue', search='_search_itz_is_overdue')
    itz_payment_status = fields.Selection(
        [('paid', 'Paid'), ('partial', 'Partially paid'), ('unpaid', 'Unpaid'), ('overdue', 'Overdue')],
        string='Payment status', compute='_compute_itz_overdue', search='_search_itz_payment_status')

    @api.depends('invoice_date_due', 'payment_state', 'state', 'move_type', 'amount_residual')
    def _compute_itz_overdue(self):
        today = fields.Date.context_today(self)
        for move in self:
            overdue = bool(move.move_type == 'out_invoice' and move.state == 'posted' and move.payment_state in ('not_paid', 'partial')
                           and move.invoice_date_due and move.invoice_date_due < today)
            move.itz_is_overdue = overdue
            move.itz_days_overdue = (today - move.invoice_date_due).days if overdue else 0
            if move.move_type not in ('out_invoice', 'out_refund') or move.state != 'posted':
                move.itz_payment_status = False
            elif move.payment_state in ('paid', 'in_payment', 'reversed'):
                move.itz_payment_status = 'paid'
            elif overdue:
                move.itz_payment_status = 'overdue'
            elif move.payment_state == 'partial':
                move.itz_payment_status = 'partial'
            else:
                move.itz_payment_status = 'unpaid'

    def _overdue_domain(self):
        today = fields.Date.context_today(self)
        return [('move_type', '=', 'out_invoice'), ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial')),
                ('invoice_date_due', '<', today)]

    def _search_itz_is_overdue(self, operator, value):
        positive = (operator == '=' and value) or (operator == '!=' and not value)
        ids = self.search(self._overdue_domain()).ids
        return [('id', 'in' if positive else 'not in', ids)]

    def _search_itz_days_overdue(self, operator, value):
        today = fields.Date.context_today(self)
        ids = self.search(self._overdue_domain()).filtered(lambda m: _cmp(operator, (today - m.invoice_date_due).days, value)).ids
        return [('id', 'in', ids)]

    def _search_itz_payment_status(self, operator, value):
        values = value if isinstance(value, (list, tuple)) else [value]
        ids = []
        for status in values:
            base = [('move_type', 'in', ('out_invoice', 'out_refund')), ('state', '=', 'posted')]
            if status == 'paid':
                ids += self.search(base + [('payment_state', 'in', ('paid', 'in_payment', 'reversed'))]).ids
            elif status == 'overdue':
                ids += self.search(self._overdue_domain()).ids
            elif status == 'partial':
                overdue = self.search(self._overdue_domain()).ids
                ids += self.search(base + [('payment_state', '=', 'partial'), ('id', 'not in', overdue)]).ids
            elif status == 'unpaid':
                overdue = self.search(self._overdue_domain()).ids
                ids += self.search(base + [('payment_state', '=', 'not_paid'), ('id', 'not in', overdue)]).ids
        return [('id', 'in' if operator in ('=', 'in') else 'not in', ids)]

    def button_draft(self):
        for move in self:
            if move.is_invoice() and move.state == 'posted' and not self.env.su:
                if not self.env.user.has_group('itz_base.group_itz_approver'):
                    raise UserError(_('Only an approver (operations manager or owner) can reset a posted invoice to draft.'))
                self.env['itz.audit.log'].log('payment', 'Invoice reset to draft', move, '%s %s' % (move.partner_id.name, move.amount_total))
        return super().button_draft()

    def _post(self, soft=True):
        res = super()._post(soft=soft)
        for move in self.filtered(lambda m: m.is_sale_document()):
            self.env['itz.audit.log'].log('payment', 'Invoice posted', move, '%s: %s %s' % (move.partner_id.name, move.amount_total, move.currency_id.name))
        return res

    def button_cancel(self):
        for move in self.filtered(lambda m: m.is_invoice() and m.state == 'posted'):
            if not self.env.su and not self.env.user.has_group('itz_base.group_itz_approver'):
                raise UserError(_('Only an approver (operations manager or owner) can cancel a posted invoice.'))
            self.env['itz.audit.log'].log('payment', 'Invoice cancelled', move, move.partner_id.name)
        return super().button_cancel()


def _cmp(operator, a, b):
    return {'>': a > b, '>=': a >= b, '<': a < b, '<=': a <= b, '=': a == b, '!=': a != b}.get(operator, False)
