from odoo import api, fields, models, _
from .stock_lot import DEVICE_STATES

EVENT_TYPES = [
    ('received', 'Received in stock'),
    ('issue', 'Issued to technician'),
    ('return', 'Returned from technician'),
    ('install', 'Installed on vehicle'),
    ('remove', 'Removed from vehicle'),
    ('replace', 'Replaced'),
    ('move', 'Moved to another vehicle'),
    ('damage', 'Marked damaged'),
    ('warranty', 'Warranty claim'),
    ('status', 'Status change'),
]


class ItzDeviceEvent(models.Model):
    """Permanent history of a device or SIM: stock moves, installs, removals, replacements."""
    _name = 'itz.device.event'
    _description = 'Device history event'
    _order = 'date desc, id desc'

    lot_id = fields.Many2one('stock.lot', string='Device / SIM', required=True, index=True, ondelete='cascade')
    product_id = fields.Many2one(related='lot_id.product_id', store=True)
    date = fields.Datetime(default=fields.Datetime.now, required=True, index=True)
    event_type = fields.Selection(EVENT_TYPES, required=True, index=True)
    old_state = fields.Selection(DEVICE_STATES)
    new_state = fields.Selection(DEVICE_STATES)
    user_id = fields.Many2one('res.users', string='Done by', default=lambda self: self.env.user, readonly=True)
    technician_id = fields.Many2one('res.users', string='Technician')
    note = fields.Text()
    picking_id = fields.Many2one('stock.picking', string='Transfer')

    @api.model
    def _log_state_changes(self, lots, new_state):
        for lot in lots:
            if lot.itz_state != new_state:
                self.sudo().create({'lot_id': lot.id, 'event_type': 'status', 'old_state': lot.itz_state, 'new_state': new_state,
                                    'note': _('Status changed manually')})
