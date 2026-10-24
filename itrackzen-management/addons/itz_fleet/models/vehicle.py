import re
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

VEHICLE_TYPES = [
    ('car', 'Car'), ('suv', 'SUV / Pick-up'), ('van', 'Van / Minibus'), ('truck', 'Truck'), ('bus', 'Bus'),
    ('motorcycle', 'Motorcycle'), ('machinery', 'Heavy machinery'), ('trailer', 'Trailer / Asset'),
    ('boat', 'Boat'), ('other', 'Other'),
]


def normalize_plate(plate):
    return re.sub(r'[^A-Z0-9]', '', (plate or '').upper())


class ItzVehicle(models.Model):
    _name = 'itz.vehicle'
    _description = 'Customer vehicle'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'itz.audit.mixin']
    _order = 'plate, id'
    _rec_name = 'plate'

    _itz_audit_fields = ['plate', 'partner_id', 'active']
    _itz_audit_category = 'installation'

    plate = fields.Char(string='Plate number', required=True, tracking=True, index='trigram')
    plate_norm = fields.Char(compute='_compute_plate_norm', store=True, index=True)
    partner_id = fields.Many2one('res.partner', string='Customer', required=True, tracking=True, index=True,
                                 domain="[('parent_id', '=', False)]", ondelete='restrict')
    driver_id = fields.Many2one('res.partner', string='Driver / contact', domain="[('parent_id', '=', partner_id)]")
    make = fields.Char()
    model = fields.Char()
    year = fields.Char()
    color = fields.Char()
    vin = fields.Char(string='Chassis / VIN')
    vehicle_type = fields.Selection(VEHICLE_TYPES, default='car')
    notes = fields.Text()
    active = fields.Boolean(default=True)
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)
    state = fields.Selection([('unequipped', 'No device'), ('equipped', 'Tracker installed')],
                             compute='_compute_state', store=True, string='Status', tracking=True)
    device_ids = fields.One2many('stock.lot', 'itz_vehicle_id', string='Installed devices and SIMs')
    device_id = fields.Many2one('stock.lot', string='Main tracker', compute='_compute_device', store=True)
    device_imei = fields.Char(related='device_id.itz_imei', string='Tracker IMEI')
    sim_lot_id = fields.Many2one('stock.lot', string='SIM', related='device_id.itz_sim_lot_id')
    sim_number = fields.Char(related='device_id.itz_sim_lot_id.itz_msisdn', string='SIM number')
    installation_ids = fields.One2many('itz.installation', 'vehicle_id', string='Installations')
    installation_count = fields.Integer(compute='_compute_counts')
    last_installation_id = fields.Many2one('itz.installation', compute='_compute_counts')
    warranty_end = fields.Date(related='device_id.itz_warranty_end', string='Warranty end')
    event_ids = fields.One2many('itz.device.event', 'vehicle_id', string='Device history')

    _sql_constraints = [
        ('plate_company_unique', 'unique(plate_norm, company_id)', 'A vehicle with this plate number already exists.'),
    ]

    @api.depends('plate')
    def _compute_plate_norm(self):
        for veh in self:
            veh.plate_norm = normalize_plate(veh.plate)

    @api.depends('device_ids', 'device_ids.itz_category', 'device_ids.itz_state')
    def _compute_device(self):
        for veh in self:
            devs = veh.device_ids.filtered(lambda l: l.itz_category == 'tracker' and l.itz_state == 'installed')
            veh.device_id = devs[:1]

    @api.depends('device_id')
    def _compute_state(self):
        for veh in self:
            veh.state = 'equipped' if veh.device_id else 'unequipped'

    @api.depends('installation_ids.state')
    def _compute_counts(self):
        for veh in self:
            done = veh.installation_ids.filtered(lambda i: i.state == 'done').sorted('date_done', reverse=True)
            veh.installation_count = len(veh.installation_ids)
            veh.last_installation_id = done[:1]

    @api.constrains('plate')
    def _check_plate(self):
        for veh in self:
            if not normalize_plate(veh.plate):
                raise ValidationError(_('Enter a valid plate number.'))

    @api.depends('plate', 'make', 'model')
    def _compute_display_name(self):
        for veh in self:
            extra = ' '.join(filter(None, [veh.make, veh.model]))
            veh.display_name = '%s (%s)' % (veh.plate, extra) if extra else veh.plate

    @api.model
    def _search_display_name(self, operator, value):
        if value and operator in ('ilike', 'like', '=', '=ilike'):
            norm = normalize_plate(value)
            return ['|', '|', '|', ('plate', operator, value), ('plate_norm', 'ilike', norm or value),
                    ('partner_id.name', 'ilike', value), ('device_ids.itz_imei', 'ilike', value)]
        return super()._search_display_name(operator, value)

    def action_view_installations(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Installations'), 'res_model': 'itz.installation',
            'view_mode': 'list,form', 'domain': [('vehicle_id', '=', self.id)],
            'context': {'default_vehicle_id': self.id, 'default_partner_id': self.partner_id.id},
        }

    def action_new_installation(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('New installation'), 'res_model': 'itz.installation',
            'view_mode': 'form', 'target': 'current',
            'context': {'default_vehicle_id': self.id, 'default_partner_id': self.partner_id.id},
        }

    def action_view_devices(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Devices and SIMs'), 'res_model': 'stock.lot',
            'view_mode': 'list,form', 'domain': [('itz_vehicle_id', '=', self.id)],
        }
