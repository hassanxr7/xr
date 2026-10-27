"""One branded HTML frame for every email the system sends: ITrackZen logo on top, company contact lines at the bottom.
The Odoo name appears nowhere. `c` is the QWeb expression that gives the company record in the template being written."""

def shell(c, heading, body, heading_if=None):
    html = """
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe4f3;">
<tr><td style="padding:20px 32px 16px;border-bottom:3px solid #1e6bff;">
  <img t-att-src="'%s/itz_branding/static/img/itrackzen-logo.png' % @C@.get_base_url()" alt="ITrackZen by LibDex" height="38" style="height:38px;width:auto;display:block;border:0;"/>
</td></tr>
<tr><td style="padding:28px 32px 8px;color:#1b2a4a;font-size:15px;line-height:1.6;">
  @H2@
  @BODY@
</td></tr>
<tr><td style="background:#f6f9fe;border-top:1px solid #e3eaf6;padding:18px 32px;font-size:12px;line-height:1.6;color:#5b6b8c;">
  <strong style="color:#0a1f44;">ITrackZen by LibDex</strong> &#183; LibDex Merchants Ltd<br/>
  <t t-if="@C@.itz_phones or @C@.phone">Tel: <t t-out="@C@.itz_phones or @C@.phone"/><br/></t>
  <t t-if="@C@.itz_sales_email or @C@.email">Email: <a t-att-href="'mailto:' + (@C@.itz_sales_email or @C@.email or '')" style="color:#1e6bff;text-decoration:none;"><t t-out="@C@.itz_sales_email or @C@.email"/></a><br/></t>
  <t t-if="@C@.website">Web: <a t-att-href="@C@.website" style="color:#1e6bff;text-decoration:none;"><t t-out="@C@.website"/></a><br/></t>
  <t t-if="@C@.itz_office_address">Office: <t t-out="(@C@.itz_office_address or '').replace(chr(10), ', ')"/></t>
</td></tr>
</table>
</td></tr>
</table>"""
    h2 = ('<h2 %sstyle="margin:0 0 14px;font-size:20px;color:#0a1f44;">%s</h2>' % ('t-if="%s" ' % heading_if if heading_if else '', heading)) if heading else ''
    return html.replace('@H2@', h2).replace('@BODY@', body).replace('@C@', c)


def button(url_expr, label):
    return (f'<p style="margin:22px 0;"><a t-att-href="{url_expr}" style="background:#1e6bff;color:#ffffff;padding:12px 22px;border-radius:8px;'
            f'text-decoration:none;font-weight:bold;display:inline-block;">{label}</a></p>')


def layout_arch():
    return '<t t-name="itz_mail.mail_layout">' + shell('company', '<t t-out="heading"/>', '<t t-out="body"/><t t-if="signature"><t t-out="signature"/></t>', heading_if='heading') + '</t>'


def invite_body(c='object.company_id'):
    return shell(c, 'Welcome to ITrackZen', f"""
<p>Dear <t t-out="object.name or ''"/>,</p>
<p><t t-out="object.create_uid.name or 'Your administrator'"/> has invited you to the ITrackZen workspace, where you will find the tools for your role.</p>
{button('object.partner_id._get_signup_url()', 'Accept invitation and set your password')}
<p style="font-size:13px;color:#5b6b8c;">This link stays valid for
<t t-out="int(int(object.env['ir.config_parameter'].sudo().get_param('auth_signup.signup.validity.hours', 144)) / 24)"/> days.<br/>
Sign-in address: <a t-att-href="object.get_base_url()" style="color:#1e6bff;"><t t-out="object.get_base_url()"/></a><br/>
Your sign-in email: <strong><t t-out="object.email or ''"/></strong></p>
<p>Kind regards,<br/>The ITrackZen team</p>""")


def reset_body(c='object.company_id'):
    return shell(c, 'Reset your password', f"""
<p>Dear <t t-out="object.name or ''"/>,</p>
<p>A password reset was requested for the ITrackZen account linked to this email address. Use the button below to choose a new password.</p>
{button('object.partner_id._get_signup_url()', 'Choose a new password')}
<p style="font-size:13px;color:#5b6b8c;">If you did not ask for this, you can ignore this email and your password stays the same.</p>
<p>Kind regards,<br/>The ITrackZen team</p>""")


def welcome_body(c='object.company_id'):
    return shell(c, 'Welcome to ITrackZen', f"""
<p>Dear <t t-out="object.name or ''"/>,</p>
<p>Your account is ready. You can sign in with the button below.</p>
{button("object.get_base_url() + '/web/login'", 'Sign in')}
<p>Kind regards,<br/>The ITrackZen team</p>""")


def reminder_body(c='object.company_id'):
    return shell(c, 'Invitations waiting', """
<t t-set="invited_users" t-value="ctx.get('invited_users', [])"/>
<p>Dear <t t-out="object.name or ''"/>,</p>
<p>These people were invited but have not set their password yet:</p>
<ul><t t-foreach="invited_users" t-as="invited_user"><li t-out="invited_user or ''"/></t></ul>
<p>Please remind them to use the link in their invitation email, or send a new invitation from the user page.</p>
<p>Kind regards,<br/>The ITrackZen team</p>""")


def new_device_body(c='object.company_id'):
    return shell(c, 'New sign-in to your account', """
<p>Dear <t t-out="object.name or ''"/>,</p>
<p>A new device was used to sign in to your account.</p>
<ul>
 <li><strong>Date:</strong> <t t-out="format_datetime(login_date, dt_format='long')"/></li>
 <li t-if="location_address"><strong>Location:</strong> <t t-out="location_address"/></li>
 <li t-if="useros"><strong>Platform:</strong> <t t-out="useros"/></li>
 <li t-if="browser"><strong>Browser:</strong> <t t-out="browser"/></li>
 <li><strong>IP address:</strong> <t t-out="ip_address"/></li>
</ul>
<p>If you do not recognise it, change your password now:</p>
<p style="margin:22px 0;"><a t-attf-href="{{ object.get_base_url() }}/web/reset_password" style="background:#1e6bff;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Reset password</a></p>
<p style="font-size:13px;color:#5b6b8c;">Otherwise you can ignore this email.</p>""")
