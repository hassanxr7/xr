from odoo import http
from odoo.http import request


class ItzBranding(http.Controller):

    @http.route('/itz/website', type='http', auth='none', methods=['GET'])
    def website(self, **kw):
        """Send people back to the ITrackZen website (URL stored in system parameter itz.website_url)."""
        url = request.env['ir.config_parameter'].sudo().get_param('itz.website_url', 'https://itrackzen.net')
        return request.redirect(url, local=False)

    @http.route('/itz/website/admin', type='http', auth='user', methods=['GET'])
    def website_admin(self, **kw):
        """Go to the ITrackZen website admin area (the staff workspace on the website)."""
        icp = request.env['ir.config_parameter'].sudo()
        url = icp.get_param('itz.website_admin_url') or (icp.get_param('itz.website_url', 'https://itrackzen.net').rstrip('/') + '/admin/')
        return request.redirect(url, local=False)
