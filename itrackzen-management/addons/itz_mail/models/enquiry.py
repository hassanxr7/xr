from odoo import _, fields, models
from odoo.exceptions import UserError


class ItzEnquiry(models.Model):
    _inherit = 'itz.enquiry'

    ack_sent = fields.Boolean(string='Acknowledgement sent', readonly=True, copy=False,
                              help='The automatic "we received your message" email was sent to the customer.')
    last_reply_date = fields.Datetime(string='Last reply sent', readonly=True, copy=False)

    def action_reply(self):
        self.ensure_one()
        if not self.email:
            raise UserError(_('This enquiry has no email address. Call or message the customer on %s instead.', self.phone or _('their phone')))
        return {
            'type': 'ir.actions.act_window', 'name': _('Reply to %s', self.contact_name), 'res_model': 'itz.enquiry.reply',
            'view_mode': 'form', 'target': 'new', 'context': {'default_enquiry_id': self.id},
        }

    def _send_acknowledgement(self):
        """Automatic first reply from the no-reply address. Replies go to the sales address."""
        from markupsafe import Markup
        from odoo.tools import formataddr, html_escape
        for enq in self:
            if enq.ack_sent or not enq.email or enq.state == 'spam':
                continue
            company = enq.company_id
            kind = dict(enq._fields['enquiry_type'].selection).get(enq.enquiry_type, 'message').lower()
            lines = ''
            if enq.service or enq.vehicles:
                bits = [x for x in (enq.service, (_('%s vehicles', enq.vehicles) if enq.vehicles else '')) if x]
                lines = '<p style="color:#5b6b8c;font-size:13px;">%s %s</p>' % (html_escape(_('You wrote to us about:')), html_escape(', '.join(bits)))
            urgent = ''
            if company.itz_phones:
                urgent = '<p>%s <strong>%s</strong>.</p>' % (html_escape(_('If your request is urgent you can also call or message us on')), html_escape(company.itz_phones))
            body = Markup(
                '<p>%s</p><p>%s</p>%s%s<p>%s<br/>%s</p>'
            ) % (
                _('Dear %s,', enq.contact_name or ''),
                _('Thank you for contacting ITrackZen. We have received your %(kind)s (reference %(ref)s). A member of our team will contact you as soon as possible.', kind=kind, ref=enq.name),
                Markup(lines), Markup(urgent), _('Kind regards,'), _('The ITrackZen team'),
            )
            full = self.env['itz.mail.setup'].render_email(_('We received your message'), body, company=company)
            sender = company.default_from_email or company.email or 'no-reply@itrackzen.net'
            try:
                with self.env.cr.savepoint():
                    note = self.env['mail.message'].sudo().create({
                        'model': enq._name, 'res_id': enq.id, 'message_type': 'comment', 'subtype_id': self.env.ref('mail.mt_note').id,
                        'body': Markup('<p><em>%s</em></p>') % _('Automatic acknowledgement sent to %s', enq.email), 'author_id': self.env.ref('base.partner_root').id})
                    self.env['mail.mail'].sudo().create({
                        'mail_message_id': note.id, 'subject': _('We received your message (%s)', enq.name), 'body_html': full,
                        'email_to': enq.email, 'email_from': formataddr(('ITrackZen', sender)),
                        'reply_to': formataddr(('ITrackZen Sales', company.itz_sales_email or sender)), 'auto_delete': False,
                    }).send(raise_exception=True)
                enq.sudo().ack_sent = True
            except Exception as exc:  # noqa: BLE001 - a mail problem must never lose the enquiry
                enq.sudo().message_post(body=_('The automatic acknowledgement email could not be sent: %s', str(exc)[:300]), message_type='comment',
                                        subtype_xmlid='mail.mt_note')
        return True
