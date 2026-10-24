from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    itz_charge_type = fields.Selection(
        [('hardware', 'Hardware'), ('installation', 'Installation / service'), ('recurring', 'Recurring plan'), ('other', 'Other')],
        string='Charge type', compute='_compute_itz_charge_type', store=True)

    @api.depends('itz_category')
    def _compute_itz_charge_type(self):
        for tmpl in self:
            cat = tmpl.itz_category
            if cat == 'plan':
                tmpl.itz_charge_type = 'recurring'
            elif cat == 'service':
                tmpl.itz_charge_type = 'installation'
            elif cat:
                tmpl.itz_charge_type = 'hardware'
            else:
                tmpl.itz_charge_type = 'other'
