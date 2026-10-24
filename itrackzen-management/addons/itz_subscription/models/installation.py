from odoo import models


class ItzInstallation(models.Model):
    _inherit = 'itz.installation'

    def _itz_after_done(self):
        res = super()._itz_after_done()
        for job in self:
            if job.job_type in ('install', 'replace', 'move', 'maintenance') and job.line_ids.filtered(lambda l: l.action == 'install'):
                subs = self.env['itz.subscription'].sudo().search([
                    ('vehicle_id', '=', job.vehicle_id.id), ('state', '=', 'draft'),
                    '|', ('sale_order_id', '=', job.sale_order_id.id), ('sale_order_id', '=', False)])
                subs.action_activate(date=job.date_done.date() if job.date_done else None)
        return res
