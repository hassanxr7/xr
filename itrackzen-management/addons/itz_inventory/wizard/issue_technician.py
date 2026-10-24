from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ItzIssueTechnician(models.TransientModel):
    """Issue equipment (devices, SIMs, cables...) from the warehouse to a technician, or take it back."""
    _name = 'itz.issue.technician'
    _description = 'Issue equipment to technician'

    mode = fields.Selection([('issue', 'Issue to technician'), ('return', 'Return from technician')], default='issue', required=True)
    technician_id = fields.Many2one('res.users', string='Technician', required=True,
                                    domain="[('itz_is_technician', '=', True)]")
    warehouse_id = fields.Many2one('stock.warehouse', default=lambda self: self.env['stock.warehouse'].search([('company_id', '=', self.env.company.id)], limit=1), required=True)
    line_ids = fields.One2many('itz.issue.technician.line', 'wizard_id', string='Equipment')
    lot_ids = fields.Many2many('stock.lot', string='Devices / SIMs to add', help='Pick several devices at once.')
    note = fields.Char()
    picking_id = fields.Many2one('stock.picking', readonly=True)

    @api.onchange('lot_ids')
    def _onchange_lot_ids(self):
        existing = self.line_ids.mapped('lot_id')
        new = [(0, 0, {'product_id': lot.product_id.id, 'lot_id': lot.id, 'quantity': 1.0}) for lot in self.lot_ids if lot not in existing]
        if new:
            self.line_ids = new
        self.lot_ids = [(5, 0, 0)]

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        lots = self.env['stock.lot'].browse(self.env.context.get('default_lot_ids', [(6, 0, [])])[0][2] if self.env.context.get('default_lot_ids') else [])
        if lots:
            res['line_ids'] = [(0, 0, {'product_id': l.product_id.id, 'lot_id': l.id, 'quantity': 1.0}) for l in lots]
            res['lot_ids'] = False
        return res

    def action_confirm(self):
        self.ensure_one()
        if not (self.env.user.has_group('itz_base.group_itz_storekeeper') or self.env.user.has_group('itz_base.group_itz_ops_manager')):
            raise UserError(_('Only the storekeeper or an operations manager can issue or take back equipment.'))
        if not self.line_ids:
            raise UserError(_('Add at least one item.'))
        employee = self.env['hr.employee'].sudo().search([('user_id', '=', self.technician_id.id), ('itz_is_technician', '=', True)], limit=1)
        if not employee or not employee.itz_stock_location_id:
            raise UserError(_('%s is not set up as a technician with a stock location.', self.technician_id.name))
        tech_loc = employee.itz_stock_location_id
        stock_loc = self.warehouse_id.lot_stock_id
        picking_type = self.warehouse_id.int_type_id
        issuing = self.mode == 'issue'
        src_default, dst = (stock_loc, tech_loc) if issuing else (tech_loc, stock_loc)
        picking = self.env['stock.picking'].sudo().create({
            'picking_type_id': picking_type.id,
            'location_id': src_default.id,
            'location_dest_id': dst.id,
            'itz_kind': self.mode,
            'itz_technician_user_id': self.technician_id.id,
            'origin': (_('Issue to %s') if issuing else _('Return from %s')) % self.technician_id.name,
            'note': self.note or False,
        })
        for line in self.line_ids:
            product = line.product_id
            src = src_default
            if line.lot_id:
                quant = self.env['stock.quant'].sudo().search([
                    ('lot_id', '=', line.lot_id.id), ('quantity', '>', 0), ('location_id', 'child_of', src_default.id)], limit=1)
                if not quant:
                    raise UserError(_('%(lot)s is not in %(loc)s.', lot=line.lot_id.display_name, loc=src_default.complete_name))
                src = quant.location_id
                if issuing and line.lot_id.itz_state not in ('available', 'reserved'):
                    raise UserError(_('%(lot)s cannot be issued: its status is "%(state)s".', lot=line.lot_id.display_name,
                                      state=dict(line.lot_id._fields['itz_state'].selection)[line.lot_id.itz_state]))
            elif product.tracking != 'none':
                raise UserError(_('Choose the serial number for %s.', product.display_name))
            move = self.env['stock.move'].sudo().create({
                'name': product.display_name, 'product_id': product.id, 'product_uom_qty': line.quantity,
                'product_uom': product.uom_id.id, 'picking_id': picking.id,
                'location_id': src.id, 'location_dest_id': dst.id, 'picking_type_id': picking_type.id,
            })
            self.env['stock.move.line'].sudo().create({
                'move_id': move.id, 'picking_id': picking.id, 'product_id': product.id,
                'lot_id': line.lot_id.id or False, 'quantity': line.quantity, 'picked': True,
                'location_id': src.id, 'location_dest_id': dst.id,
            })
        picking.action_confirm()
        picking.with_context(skip_backorder=True, skip_sms=True, skip_immediate=True).button_validate()
        if picking.state != 'done':
            raise UserError(_('The transfer could not be completed (status: %s).', picking.state))
        self.picking_id = picking
        self.env['itz.audit.log'].log('stock', 'Equipment issued' if issuing else 'Equipment returned', picking,
                                      '%s: %s' % (self.technician_id.name, ', '.join(self.line_ids.mapped(lambda l: l.lot_id.name or l.product_id.display_name))))
        return {
            'type': 'ir.actions.act_window', 'res_model': 'stock.picking', 'res_id': picking.id,
            'view_mode': 'form', 'target': 'current',
        }


class ItzIssueTechnicianLine(models.TransientModel):
    _name = 'itz.issue.technician.line'
    _description = 'Issue equipment line'

    wizard_id = fields.Many2one('itz.issue.technician', required=True, ondelete='cascade')
    product_id = fields.Many2one('product.product', required=True, domain="[('itz_is_stockable', '=', True)]")
    tracking = fields.Selection(related='product_id.tracking')
    lot_id = fields.Many2one('stock.lot', string='IMEI / Serial', domain="[('product_id', '=', product_id)]")
    quantity = fields.Float(default=1.0, required=True)

    @api.onchange('lot_id')
    def _onchange_lot(self):
        if self.lot_id:
            self.product_id = self.lot_id.product_id
            self.quantity = 1.0
