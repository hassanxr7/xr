from odoo import api, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model
    def _itz_apply_document_layout(self):
        layout = self.env.ref('web.external_layout_standard', raise_if_not_found=False)
        for company in self.search([]):
            vals = {'layout_background': 'Blank'}
            if layout:
                vals['external_report_layout_id'] = layout.id
            company.write(vals)
