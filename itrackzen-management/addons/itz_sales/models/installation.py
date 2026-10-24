from odoo import api, fields, models, _


class ItzInstallation(models.Model):
    _inherit = 'itz.installation'

    sale_order_id = fields.Many2one('sale.order', string='Sales order', index=True, copy=False, groups='itz_base.group_itz_see_all')

    def _itz_move_vals(self, line, picking, src, dst):
        vals = super()._itz_move_vals(line, picking, src, dst)
        sale_line = getattr(line, 'sale_line_id', False)
        if sale_line and line.action == 'install':
            vals['sale_line_id'] = sale_line.id
        return vals


class ItzInstallationLine(models.Model):
    _inherit = 'itz.installation.line'

    sale_line_id = fields.Many2one('sale.order.line', string='Order line', copy=False, groups='itz_base.group_itz_see_all')
