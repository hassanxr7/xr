from odoo import api, fields, models, _


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    itz_vehicle_id = fields.Many2one('itz.vehicle', string='Vehicle', domain="[('partner_id', '=', parent.partner_id)]",
                                     help='The vehicle this line is for (device, installation or tracking plan).')
    itz_charge_type = fields.Selection(related='product_id.itz_charge_type', store=True, string='Charge type')

    def _prepare_invoice_line(self, **optional_values):
        vals = super()._prepare_invoice_line(**optional_values)
        if self.itz_vehicle_id and vals.get('name'):
            vals['name'] = '%s\nVehicle: %s' % (vals['name'], self.itz_vehicle_id.plate)
        return vals

    def _action_launch_stock_rule(self, previous_product_uom_qty=False):
        # Equipment installed by a technician leaves stock when the installation job is completed, not on confirmation.
        lines = self.filtered(lambda l: l.product_id.itz_fulfilment != 'installation')
        return super(SaleOrderLine, lines)._action_launch_stock_rule(previous_product_uom_qty)

    # --- approval is reset when commercial terms change after approval
    def _itz_reset_orders(self, reason):
        orders = self.order_id.filtered(lambda o: o.state in ('draft', 'sent') and o.itz_approval_state == 'approved')
        orders._itz_reset_approval(reason)

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        lines._itz_reset_orders(_('A line was added'))
        return lines

    def write(self, vals):
        watched = {'price_unit', 'discount', 'product_uom_qty', 'product_id', 'tax_id'}
        res = super().write(vals)
        if watched & set(vals):
            self._itz_reset_orders(_('Order lines were changed'))
        return res

    def unlink(self):
        orders = self.order_id
        res = super().unlink()
        orders.filtered(lambda o: o.state in ('draft', 'sent') and o.itz_approval_state == 'approved')._itz_reset_approval(_('A line was removed'))
        return res
