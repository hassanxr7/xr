from odoo import api, fields, models, _
from odoo.exceptions import UserError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    itz_kind = fields.Selection(
        [('issue', 'Issue to technician'), ('return', 'Return from technician')],
        string='ITrackZen transfer', copy=False, index=True)
    itz_technician_user_id = fields.Many2one('res.users', string='Technician', copy=False, index=True)

    def _action_done(self):
        res = super()._action_done()
        for picking in self:
            picking.sudo()._itz_after_done()
        return res

    def _itz_after_done(self):
        """Keep device status and history in sync with real stock movements; write audit entries."""
        Lot = self.env['stock.lot'].sudo()
        audit = self.env['itz.audit.log']
        Event = self.env['itz.device.event'].sudo()
        for line in self.move_line_ids.filtered(lambda l: l.quantity and l.state == 'done'):
            src, dst = line.location_id, line.location_dest_id
            lot = line.lot_id
            if lot and lot.itz_category:
                tech_dst, tech_src = dst.itz_technician_user_id, src.itz_technician_user_id
                if src.usage == 'customer' and dst.usage == 'internal':
                    lot._itz_set_state('returned', note=_('Taken back from customer'), event_type='return', technician=tech_dst or self.env['res.users'])
                elif tech_dst:
                    lot._itz_set_state('issued', note=_('Issued to %s', tech_dst.name), event_type='issue', technician=tech_dst)
                elif dst.usage == 'customer':
                    # Installation completion sets vehicle details; a plain delivery just marks it installed/at customer.
                    if lot.itz_state != 'installed':
                        lot._itz_set_state('installed', note=_('Delivered to customer'), event_type='install', technician=self.env['res.users'])
                elif src.usage == 'supplier' and dst.usage == 'internal':
                    lot.write({'itz_supplier_id': self.partner_id.id or False})
                    lot._itz_set_state('available', note=_('Received from %s', self.partner_id.name or 'supplier'), event_type='received', technician=self.env['res.users'])
                elif tech_src and dst.usage == 'internal' and not tech_dst:
                    lot._itz_set_state('returned', note=_('Returned by %s', tech_src.name), event_type='return', technician=self.env['res.users'])
                elif dst.usage == 'inventory' and dst.scrap_location:
                    lot._itz_set_state('damaged', note=_('Scrapped'), event_type='damage', technician=self.env['res.users'])
        audit.log('stock', 'Transfer validated', self, '; '.join(
            '%s x %s %s -> %s%s' % (l.quantity, l.product_id.display_name, l.location_id.complete_name, l.location_dest_id.complete_name,
                                    (' [%s]' % l.lot_id.name) if l.lot_id else '')
            for l in self.move_line_ids.filtered('quantity')))

    def action_itz_open_issue_wizard(self):
        return {
            'type': 'ir.actions.act_window', 'name': _('Issue to technician'), 'res_model': 'itz.issue.technician',
            'view_mode': 'form', 'target': 'new', 'context': {'default_mode': 'issue'},
        }
