from collections import OrderedDict
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ItzStatementWizard(models.TransientModel):
    """Customer statement: opening balance, invoices, payments with a running balance and ageing of what is still owed."""
    _name = 'itz.statement.wizard'
    _description = 'Customer statement'

    partner_id = fields.Many2one('res.partner', string='Customer', required=True, domain="[('parent_id', '=', False)]")
    date_from = fields.Date(string='From', default=lambda self: fields.Date.context_today(self).replace(day=1, month=1), required=True)
    date_to = fields.Date(string='To', default=fields.Date.context_today, required=True)
    only_open = fields.Boolean(string='Only open invoices', help='List only invoices that are not fully paid.')
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)

    def _receivable_lines(self, extra=None):
        domain = [
            ('partner_id', 'child_of', self.partner_id.commercial_partner_id.id),
            ('account_id.account_type', '=', 'asset_receivable'),
            ('parent_state', '=', 'posted'),
            ('company_id', '=', self.company_id.id),
        ] + (extra or [])
        return self.env['account.move.line'].sudo().search(domain, order='date, id')

    def _get_data(self):
        self.ensure_one()
        opening_lines = self._receivable_lines([('date', '<', self.date_from)])
        opening = sum(opening_lines.mapped('balance'))
        lines = self._receivable_lines([('date', '>=', self.date_from), ('date', '<=', self.date_to)])
        rows, running = [], opening
        for ml in lines:
            if self.only_open and ml.move_id.payment_state in ('paid', 'in_payment', 'reversed') and ml.move_id.is_invoice():
                continue
            running += ml.balance
            rows.append({
                'date': ml.date, 'ref': ml.move_id.name, 'description': ml.name or ml.move_id.ref or '',
                'due': ml.date_maturity if ml.move_id.is_invoice() else False,
                'debit': ml.debit, 'credit': ml.credit, 'balance': running,
                'kind': 'invoice' if ml.move_id.is_invoice() else 'payment',
            })
        # Ageing of everything still owed at date_to
        open_lines = self._receivable_lines([('date', '<=', self.date_to), ('reconciled', '=', False)])
        buckets = OrderedDict([('current', 0.0), ('d1_30', 0.0), ('d31_60', 0.0), ('d61_90', 0.0), ('d90', 0.0)])
        for ml in open_lines:
            amt = ml.amount_residual
            due = ml.date_maturity or ml.date
            days = (self.date_to - due).days
            if days <= 0:
                buckets['current'] += amt
            elif days <= 30:
                buckets['d1_30'] += amt
            elif days <= 60:
                buckets['d31_60'] += amt
            elif days <= 90:
                buckets['d61_90'] += amt
            else:
                buckets['d90'] += amt
        return {
            'opening': opening, 'rows': rows, 'closing': running, 'ageing': buckets,
            'total_debit': sum(r['debit'] for r in rows), 'total_credit': sum(r['credit'] for r in rows),
            'currency': self.company_id.currency_id,
        }

    def action_print(self):
        self.ensure_one()
        self.env['itz.audit.log'].log('other', 'Statement printed', self.partner_id, '%s to %s' % (self.date_from, self.date_to))
        return self.env.ref('itz_finance.action_report_statement').report_action(self)

    def action_send(self):
        self.ensure_one()
        template = self.env.ref('itz_finance.mail_template_statement')
        if not self.partner_id.email:
            raise UserError(_('%s has no email address.', self.partner_id.name))
        report = self.env.ref('itz_finance.action_report_statement')
        pdf, _ext = report._render_qweb_pdf(report.report_name, res_ids=self.ids)
        attachment = self.env['ir.attachment'].create({
            'name': 'Statement-%s.pdf' % self.partner_id.name, 'type': 'binary', 'raw': pdf,
            'res_model': 'res.partner', 'res_id': self.partner_id.id, 'mimetype': 'application/pdf'})
        template.send_mail(self.partner_id.id, force_send=True, email_values={'attachment_ids': [(4, attachment.id)]})
        self.env['itz.audit.log'].log('other', 'Statement emailed', self.partner_id, self.partner_id.email)
        return {'type': 'ir.actions.client', 'tag': 'display_notification',
                'params': {'title': _('Statement sent'), 'message': _('Sent to %s', self.partner_id.email), 'type': 'success'}}
