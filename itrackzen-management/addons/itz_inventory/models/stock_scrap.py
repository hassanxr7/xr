from odoo import models, _
from odoo.exceptions import UserError


class StockScrap(models.Model):
    _inherit = 'stock.scrap'

    def do_scrap(self):
        if not self.env.su and not (self.env.user.has_group('itz_base.group_itz_storekeeper') or self.env.user.has_group('itz_base.group_itz_ops_manager')):
            raise UserError(_('Only the storekeeper or an operations manager can scrap stock.'))
        res = super().do_scrap()
        for scrap in self:
            if scrap.lot_id and scrap.lot_id.itz_category:
                scrap.lot_id.sudo()._itz_set_state('damaged', note='Scrapped (%s)' % scrap.name, event_type='damage', technician=self.env['res.users'])
            self.env['itz.audit.log'].log('stock', 'Scrap', scrap, '%s x %s' % (scrap.scrap_qty, scrap.product_id.display_name))
        return res
