from odoo import api, fields, models, _


class ResPartner(models.Model):
    _inherit = 'res.partner'

    itz_balance_due = fields.Monetary(string='Outstanding balance', compute='_compute_itz_finance', currency_field='itz_currency_id',
                                      groups='itz_base.group_itz_financial')
    itz_overdue_amount = fields.Monetary(string='Overdue', compute='_compute_itz_finance', currency_field='itz_currency_id',
                                         groups='itz_base.group_itz_financial')
    itz_overdue_count = fields.Integer(string='Overdue invoices', compute='_compute_itz_finance', groups='itz_base.group_itz_financial')
    itz_last_payment_date = fields.Date(string='Last payment', compute='_compute_itz_finance', groups='itz_base.group_itz_financial')
    itz_currency_id = fields.Many2one('res.currency', compute='_compute_itz_currency')
    itz_payment_count = fields.Integer(string='Payments', compute='_compute_itz_finance', groups='itz_base.group_itz_financial')

    def _compute_itz_currency(self):
        for partner in self:
            partner.itz_currency_id = partner.company_id.currency_id or self.env.company.currency_id

    def _compute_itz_finance(self):
        Move = self.env['account.move'].sudo()
        Payment = self.env['account.payment'].sudo()
        today = fields.Date.context_today(self)
        for partner in self:
            commercial = partner.commercial_partner_id
            invoices = Move.search([
                ('commercial_partner_id', '=', commercial.id), ('move_type', 'in', ('out_invoice', 'out_refund')),
                ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial', 'in_payment'))])
            partner.itz_balance_due = sum(invoices.mapped('amount_residual_signed'))
            late = invoices.filtered(lambda m: m.move_type == 'out_invoice' and m.invoice_date_due and m.invoice_date_due < today and m.amount_residual > 0)
            partner.itz_overdue_amount = sum(late.mapped('amount_residual_signed'))
            partner.itz_overdue_count = len(late)
            payments = Payment.search([('partner_id', 'child_of', commercial.id), ('payment_type', '=', 'inbound'), ('state', 'in', ('in_process', 'paid'))], order='date desc')
            partner.itz_payment_count = len(payments)
            partner.itz_last_payment_date = payments[:1].date

    def action_view_itz_payments(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Payments'), 'res_model': 'account.payment',
            'view_mode': 'list,form', 'domain': [('partner_id', 'child_of', self.commercial_partner_id.id), ('payment_type', '=', 'inbound')],
        }

    def action_view_itz_unpaid_invoices(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Unpaid invoices'), 'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [('commercial_partner_id', '=', self.commercial_partner_id.id), ('move_type', '=', 'out_invoice'),
                       ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial'))],
        }

    def action_itz_statement(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Customer statement'), 'res_model': 'itz.statement.wizard',
            'view_mode': 'form', 'target': 'new', 'context': {'default_partner_id': self.commercial_partner_id.id},
        }
