from odoo import fields, models

DEFAULT_BRIEF = (
    "ITrackZen is a GPS vehicle tracking and fleet management service operated by LibDex Merchants Ltd, with an office in Nairobi, Kenya. "
    "We supply and install GPS trackers, dashcams, fuel sensors and related hardware, and provide tracking subscriptions per vehicle with a "
    "live map, route history, alerts and reports. We work with customers across East and Central Africa. "
    "Hardware is quoted per customer: never state fixed hardware prices. Subscription plans and prices are on the website pricing page."
)


class ResCompany(models.Model):
    _inherit = 'res.company'

    itz_sales_email = fields.Char(string='Sales email address', default='sales@itrackzen.net',
                                  help='Replies from the Reply button are sent from this address and customers reply to it.')
    itz_phones = fields.Char(string='Phone numbers shown in emails', help='For example: +254 700 000 000 / +254 711 000 000')
    itz_office_address = fields.Text(string='Office address shown in emails', help='For example the Nairobi office: building, street, city.')
    itz_ai_enabled = fields.Boolean(string='Draft replies with AI', help='Staff can ask the AI to write a professional reply from a few notes. '
                                    'The customer message and your notes are sent to the AI service to write the draft.')
    itz_ai_api_key = fields.Char(string='AI service key', groups='itz_base.group_itz_owner',
                                 help='Key from console.anthropic.com. Stored on this server and visible to the owner only.')
    itz_ai_model = fields.Char(string='AI model', default='claude-opus-5-5', groups='itz_base.group_itz_owner')
    itz_ai_brief = fields.Text(string='About the company (for the AI)', default=DEFAULT_BRIEF, groups='itz_base.group_itz_owner',
                               help='Facts the AI may use. It is told not to invent prices, dates or promises beyond this and the notes you type.')
