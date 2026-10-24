from odoo import http
from odoo.http import request


class ItzBranding(http.Controller):

    @http.route('/itz/website', type='http', auth='none', methods=['GET'])
    def website(self, **kw):
        """Send people back to the ITrackZen website (URL stored in system parameter itz.website_url)."""
        url = request.env['ir.config_parameter'].sudo().get_param('itz.website_url', 'https://itrackzen.net')
        return request.redirect(url, local=False)
