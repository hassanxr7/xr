from odoo import http, _
from odoo.exceptions import AccessError, UserError
from odoo.http import request, content_disposition


class ItzReportController(http.Controller):

    @http.route('/itz/report/xlsx', type='http', auth='user', methods=['GET'])
    def xlsx(self, type=None, df=None, dt=None, tech=None, partner=None, **kw):
        wizard = request.env['itz.report.wizard'].create({
            'report_type': type or 'stock_availability',
            'date_from': df or False, 'date_to': dt or False,
            'technician_id': int(tech) if tech else False,
            'partner_id': int(partner) if partner else False,
        })
        try:
            content = wizard.to_xlsx()
        except AccessError:
            return request.make_response(_('You are not allowed to run this report.'), status=403)
        except UserError as exc:
            return request.make_response(str(exc), status=400)
        name = 'ITrackZen-%s-%s.xlsx' % (wizard.report_type, http.request.env.cr.now().strftime('%Y%m%d'))
        return request.make_response(content, headers=[
            ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ('Content-Disposition', content_disposition(name)),
        ])
