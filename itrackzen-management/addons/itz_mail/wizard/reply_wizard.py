from markupsafe import Markup

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import email_normalize, formataddr, html2plaintext, is_html_empty

from ..models.ai import LANGUAGES, text_to_html


class ItzEnquiryReply(models.TransientModel):
    _name = 'itz.enquiry.reply'
    _description = 'Reply to an enquiry by email'

    enquiry_id = fields.Many2one('itz.enquiry', required=True, readonly=True, ondelete='cascade')
    contact_name = fields.Char(related='enquiry_id.contact_name')
    customer_message = fields.Text(related='enquiry_id.message', string='Their message')
    email_to = fields.Char(string='To', required=True)
    subject = fields.Char(required=True)
    language = fields.Selection(LANGUAGES, default='en', string='Write in')
    instructions = fields.Text(string='What do you want to tell them?',
                               help='A few short notes are enough, in any language. For example: thank them, say we can supply 10 trackers, ask which countries.')
    body = fields.Html(string='Email', sanitize=True)
    ai_ready = fields.Boolean(compute='_compute_ai_ready')
    drafted_by = fields.Char(readonly=True)

    @api.depends('enquiry_id')
    def _compute_ai_ready(self):
        ready = self.env['itz.mail.ai'].is_ready()
        for wiz in self:
            wiz.ai_ready = ready

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        enq = self.env['itz.enquiry'].browse(res.get('enquiry_id') or self.env.context.get('default_enquiry_id')).exists()
        if enq:
            res.setdefault('email_to', enq.email)
            res.setdefault('subject', 'Re: %s' % (enq.service or _('Your enquiry')) + ' (%s)' % enq.name)
        return res

    def _reopen(self):
        return {'type': 'ir.actions.act_window', 'res_model': self._name, 'res_id': self.id, 'view_mode': 'form', 'target': 'new',
                'name': _('Reply to %s', self.contact_name)}

    def action_draft(self):
        self.ensure_one()
        if not (self.instructions or '').strip():
            raise UserError(_('Write a few words about what you want to say, then press the button.'))
        text, used_ai = self.env['itz.mail.ai'].draft(self.enquiry_id, self.instructions, self.language or 'en')
        self.write({'body': text_to_html(text), 'drafted_by': _('Written with AI. Read it, change anything you like, then send.') if used_ai
                    else _('AI is not switched on, so your notes were put into a simple template. Edit it, then send.')})
        return self._reopen()

    def _signature(self):
        return Markup('<p style="margin:18px 0 0;">%s<br/><strong>%s</strong><br/>%s</p>') % (
            _('Kind regards,'), self.env.user.name, _('Sales, ITrackZen by LibDex'))

    def action_send(self):
        self.ensure_one()
        to = email_normalize(self.email_to)
        if not to:
            raise UserError(_('Enter a valid email address in the To field.'))
        if is_html_empty(self.body):
            raise UserError(_('The email is empty. Write it, or use "Write it for me".'))
        enq = self.enquiry_id
        company = enq.company_id
        full = self.env['itz.mail.setup'].render_email(False, self.body, signature=self._signature(), company=company)
        sales = company.itz_sales_email or company.email or ''
        sender = formataddr((_('%s (ITrackZen)', self.env.user.name), sales)) if sales else False
        note = enq.message_post(
            body=Markup('<p><strong>%s</strong> %s</p>') % (_('Email sent to'), to) + Markup(self.body), subject=self.subject,
            message_type='comment', subtype_xmlid='mail.mt_note')
        mail = self.env['mail.mail'].sudo().create({
            'mail_message_id': note.id, 'subject': self.subject, 'body_html': full, 'email_to': to, 'email_from': sender,
            'reply_to': formataddr(('ITrackZen Sales', sales)) if sales else False, 'auto_delete': False,
        })
        try:
            mail.send(raise_exception=True)
        except Exception as exc:  # noqa: BLE001
            raise UserError(_('The email could not be sent: %s\nYour text is kept: close this window, open the enquiry and try again.', str(exc)[:300]))
        vals = {'last_reply_date': fields.Datetime.now()}
        if enq.state == 'new':
            vals['state'] = 'contacted'
        enq.write(vals)
        return {'type': 'ir.actions.client', 'tag': 'display_notification',
                'params': {'title': _('Email sent'), 'message': _('Sent to %s', to), 'type': 'success', 'next': {'type': 'ir.actions.act_window_close'}}}
