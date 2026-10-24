from odoo import api, models, _
from odoo.exceptions import UserError


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    @api.model
    def _apply_inventory(self):  # noqa: D401
        """Inventory adjustments are restricted to stock managers and always logged."""
        if not self.env.is_superuser() and not self.env.user.has_group('stock.group_stock_manager'):
            raise UserError(_('Only an operations manager can apply stock adjustments.'))
        for quant in self:
            self.env['itz.audit.log'].log('stock', 'Stock adjustment', quant.product_id,
                                          '%s at %s: %s -> %s%s' % (quant.product_id.display_name, quant.location_id.complete_name,
                                                                    quant.quantity, quant.inventory_quantity,
                                                                    (' [%s]' % quant.lot_id.name) if quant.lot_id else ''))
        return super()._apply_inventory()
