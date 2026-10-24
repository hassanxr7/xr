from odoo import models


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    def button_confirm(self):
        res = super().button_confirm()
        for po in self:
            self.env['itz.audit.log'].log('stock', 'Purchase order confirmed', po, '%s %s' % (po.partner_id.name, po.amount_total))
        return res
