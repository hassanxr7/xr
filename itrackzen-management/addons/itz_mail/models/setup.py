from odoo import api, models

from . import skeleton

TEMPLATES = {
    'auth_signup.set_password_email': ('{{ object.create_uid.name }} invited you to ITrackZen', skeleton.invite_body),
    'auth_signup.mail_template_user_signup_account_created': ('Welcome to ITrackZen', skeleton.welcome_body),
    'auth_signup.mail_template_data_unregistered_users': ('Invitations waiting', skeleton.reminder_body),
}
VIEWS = {
    'auth_signup.reset_password_email': skeleton.reset_body,
    'auth_signup.alert_login_new_device': skeleton.new_device_body,
}


class ItzMailSetup(models.AbstractModel):
    """Run on every module update: installs the branded email frame and replaces the invitation / password emails that name Odoo."""
    _name = 'itz.mail.setup'
    _description = 'ITrackZen email setup'

    @api.model
    def install(self):
        env = self.env
        layout = env.ref('itz_mail.mail_layout').sudo()
        layout.arch_base = skeleton.layout_arch()
        root = env.ref('base.partner_root', raise_if_not_found=False)
        if root and root.name == 'OdooBot':          # the system user's name shows in chatter and in emails sent by the system
            root.sudo().name = 'ITrackZen'
        for xmlid, (subject, body) in TEMPLATES.items():
            tmpl = env.ref(xmlid, raise_if_not_found=False)
            if tmpl:
                tmpl.sudo().write({'subject': subject, 'body_html': body()})
        for xmlid, body in VIEWS.items():
            view = env.ref(xmlid, raise_if_not_found=False)
            if view:
                view.sudo().arch_base = '<t t-name="%s">%s</t>' % (xmlid, body())
        return True

    @api.model
    def render_email(self, heading, body, signature=None, company=None):
        """Full branded HTML for one email. `body` and `signature` are Markup (already safe)."""
        company = company or self.env.company
        return self.env['ir.qweb'].sudo()._render('itz_mail.mail_layout', {'company': company, 'heading': heading, 'body': body, 'signature': signature})
