from odoo import api, models


class ItzWebsiteEvent(models.Model):
    _inherit = 'itz.website.event'

    @api.model
    def _handle_enquiry_created(self, data):
        ref = str(data.get('ref') or '')
        existed = bool(ref) and bool(self.env['itz.enquiry'].sudo().search_count([('website_ref', '=', ref)]))
        enquiry = super()._handle_enquiry_created(data)
        if enquiry and not existed:
            enquiry.sudo()._send_acknowledgement()
        return enquiry
