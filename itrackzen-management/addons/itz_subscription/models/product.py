from odoo import api, fields, models

CYCLES = [('monthly', 'Monthly'), ('quarterly', 'Every 3 months'), ('semiannual', 'Every 6 months'), ('annual', 'Yearly')]
CYCLE_MONTHS = {'monthly': 1, 'quarterly': 3, 'semiannual': 6, 'annual': 12}


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    itz_plan_cycle = fields.Selection(CYCLES, string='Billing cycle', default='monthly')
    itz_plan_months = fields.Integer(compute='_compute_itz_plan_months', string='Months per cycle')

    @api.depends('itz_plan_cycle')
    def _compute_itz_plan_months(self):
        for tmpl in self:
            tmpl.itz_plan_months = CYCLE_MONTHS.get(tmpl.itz_plan_cycle, 1)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('itz_category') == 'plan':
                vals.setdefault('invoice_policy', 'order')
        return super().create(vals_list)
