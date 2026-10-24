import re
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError, UserError

DEVICE_STATES = [
    ('available', 'Available'),
    ('reserved', 'Reserved'),
    ('issued', 'Issued to technician'),
    ('installed', 'Installed'),
    ('returned', 'Returned'),
    ('damaged', 'Damaged'),
    ('warranty', 'Under warranty claim'),
]


def luhn_ok(number):
    digits = [int(c) for c in number][::-1]
    total = sum(digits[0::2]) + sum(sum(divmod(2 * d, 10)) for d in digits[1::2])
    return total % 10 == 0


class StockLot(models.Model):
    _name = 'stock.lot'
    _inherit = ['stock.lot', 'itz.audit.mixin']

    _itz_audit_fields = ['name', 'itz_imei', 'itz_state', 'itz_msisdn', 'itz_sim_lot_id', 'itz_warranty_end']
    _itz_audit_category = 'device'

    itz_category = fields.Selection(related='product_id.itz_category', store=True, index=True, string='ITrackZen Category')
    itz_is_device = fields.Boolean(related='product_id.itz_is_device', store=True)
    itz_imei = fields.Char(string='IMEI', copy=False, index=True, tracking=True)
    itz_imei_valid = fields.Boolean(string='IMEI checksum OK', compute='_compute_itz_imei_valid')
    itz_state = fields.Selection(DEVICE_STATES, string='Device status', default='available', index=True, tracking=True, copy=False)
    itz_technician_user_id = fields.Many2one('res.users', string='Issued to', copy=False, index=True, readonly=True, tracking=True)
    itz_supplier_id = fields.Many2one('res.partner', string='Supplier', copy=False)
    # SIM card details (when the product is a SIM)
    itz_msisdn = fields.Char(string='SIM phone number', copy=False, index=True)
    itz_carrier = fields.Char(string='SIM network / carrier')
    itz_apn = fields.Char(string='APN')
    itz_sim_pin = fields.Char(string='SIM PIN / PUK', groups='itz_base.group_itz_storekeeper,itz_base.group_itz_ops_manager')
    # Pairing: a device has one SIM, and a SIM sits in one device
    itz_sim_lot_id = fields.Many2one('stock.lot', string='SIM in device', copy=False, domain="[('itz_category', '=', 'sim')]",
                                     index=True, ondelete='set null', tracking=True)
    itz_device_lot_id = fields.Many2one('stock.lot', string='Used in device', compute='_compute_itz_device_lot_id', search='_search_itz_device_lot_id')
    itz_warranty_months = fields.Integer(string='Warranty (months)')
    itz_warranty_start = fields.Date(string='Warranty start', copy=False)
    itz_warranty_end = fields.Date(string='Warranty end', compute='_compute_itz_warranty_end', store=True)
    itz_warranty_active = fields.Boolean(string='In warranty', compute='_compute_itz_warranty_active', search='_search_itz_warranty_active')
    itz_event_ids = fields.One2many('itz.device.event', 'lot_id', string='History')
    itz_event_count = fields.Integer(compute='_compute_itz_event_count')
    itz_location_id = fields.Many2one('stock.location', string='Current location', compute='_compute_itz_location')

    _sql_constraints = [
        ('itz_imei_unique', 'unique(itz_imei)', 'This IMEI already exists on another device.'),
        ('itz_msisdn_unique', 'unique(itz_msisdn)', 'This SIM phone number is already used by another SIM.'),
    ]

    # ---------------------------------------------------------------- computes
    @api.depends('itz_imei')
    def _compute_itz_imei_valid(self):
        for lot in self:
            lot.itz_imei_valid = bool(lot.itz_imei and re.fullmatch(r'\d{15}', lot.itz_imei) and luhn_ok(lot.itz_imei))

    def _compute_itz_device_lot_id(self):
        for lot in self:
            device = self.search([('itz_sim_lot_id', '=', lot.id)], limit=1) if lot.id else self.browse()
            lot.itz_device_lot_id = device

    def _search_itz_device_lot_id(self, operator, value):
        used = self.sudo().with_context(active_test=False).search([('itz_sim_lot_id', '!=', False)])
        if value is False or value is None:
            return [('id', 'in' if operator in ('!=', 'not in') else 'not in', used.mapped('itz_sim_lot_id').ids)]
        devices = self.browse(value if isinstance(value, list) else [value])
        return [('id', 'in', devices.mapped('itz_sim_lot_id').ids)]

    @api.depends('itz_warranty_start', 'itz_warranty_months')
    def _compute_itz_warranty_end(self):
        for lot in self:
            if lot.itz_warranty_start and lot.itz_warranty_months:
                lot.itz_warranty_end = fields.Date.add(lot.itz_warranty_start, months=lot.itz_warranty_months)
            else:
                lot.itz_warranty_end = False

    def _compute_itz_warranty_active(self):
        today = fields.Date.context_today(self)
        for lot in self:
            lot.itz_warranty_active = bool(lot.itz_warranty_end and lot.itz_warranty_end >= today)

    def _search_itz_warranty_active(self, operator, value):
        today = fields.Date.context_today(self)
        positive = (operator == '=' and value) or (operator == '!=' and not value)
        if positive:
            return [('itz_warranty_end', '>=', today)]
        return ['|', ('itz_warranty_end', '=', False), ('itz_warranty_end', '<', today)]

    def _compute_itz_event_count(self):
        data = dict(self.env['itz.device.event']._read_group([('lot_id', 'in', self.ids)], ['lot_id'], ['__count']))
        for lot in self:
            lot.itz_event_count = data.get(lot, 0)

    def _compute_itz_location(self):
        quants = self.env['stock.quant'].sudo().search([('lot_id', 'in', self.ids), ('quantity', '>', 0), ('location_id.usage', 'in', ('internal', 'customer'))])
        loc = {}
        for q in quants:
            loc[q.lot_id.id] = q.location_id
        for lot in self:
            lot.itz_location_id = loc.get(lot.id, False)

    # -------------------------------------------------------------- constraints
    @api.constrains('itz_imei', 'product_id')
    def _check_itz_imei(self):
        for lot in self:
            if lot.itz_imei and not re.fullmatch(r'\d{14,16}', lot.itz_imei):
                raise ValidationError(_('IMEI must contain only digits (15 digits for most trackers). Received: %s', lot.itz_imei))

    @api.constrains('name', 'product_id')
    def _check_itz_serial_unique_everywhere(self):
        """Serial numbers of ITrackZen devices and SIM cards must be unique across ALL products, not only per product."""
        for lot in self.filtered(lambda l: l.itz_category in ('tracker', 'dashcam', 'fuel_sensor', 'relay', 'rfid', 'sim')):
            dup = self.sudo().search([('name', '=', lot.name), ('id', '!=', lot.id), ('itz_category', '=', lot.itz_category),
                                      ('company_id', 'in', [lot.company_id.id, False])], limit=1)
            if dup:
                raise ValidationError(_('The serial number %(sn)s already exists (product %(prod)s).',
                                        sn=lot.name, prod=dup.product_id.display_name))

    @api.constrains('itz_sim_lot_id')
    def _check_itz_sim(self):
        for lot in self.filtered('itz_sim_lot_id'):
            if lot.itz_sim_lot_id.itz_category != 'sim':
                raise ValidationError(_('%s is not a SIM card.', lot.itz_sim_lot_id.display_name))
            other = self.sudo().search([('itz_sim_lot_id', '=', lot.itz_sim_lot_id.id), ('id', '!=', lot.id)], limit=1)
            if other:
                raise ValidationError(_('SIM %(sim)s is already used in device %(dev)s.', sim=lot.itz_sim_lot_id.display_name, dev=other.display_name))

    # ------------------------------------------------------------------- ORM
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            product = self.env['product.product'].browse(vals['product_id']) if vals.get('product_id') else self.env['product.product']
            if product and product.itz_category in ('tracker', 'dashcam'):
                imei = (vals.get('itz_imei') or '').strip() or False
                name = (vals.get('name') or '').strip()
                if not imei and re.fullmatch(r'\d{14,16}', name or ''):
                    imei = name
                if imei:
                    vals['itz_imei'] = imei
                    vals['name'] = name or imei
            if product and not vals.get('itz_warranty_months'):
                vals['itz_warranty_months'] = product.itz_warranty_months
        self._itz_precheck_unique(vals_list)
        return super().create(vals_list)

    def _itz_precheck_unique(self, vals_list):
        """Friendly error before the database unique index is hit."""
        for field, label in (('itz_imei', _('IMEI')), ('itz_msisdn', _('SIM phone number'))):
            seen = set()
            for vals in vals_list:
                value = (vals.get(field) or '').strip() if isinstance(vals.get(field), str) else vals.get(field)
                if not value:
                    continue
                if value in seen:
                    raise ValidationError(_('%(label)s %(value)s is listed twice.', label=label, value=value))
                seen.add(value)
                exists = self.sudo().with_context(active_test=False).search([(field, '=', value)] + ([('id', 'not in', self.ids)] if self else []), limit=1)
                if exists:
                    raise ValidationError(_('%(label)s %(value)s already exists on %(rec)s.', label=label, value=value, rec=exists.display_name))

    def write(self, vals):
        self._itz_precheck_unique([vals])
        if 'itz_state' in vals and not self.env.context.get('itz_state_internal'):
            self.env['itz.device.event']._log_state_changes(self, vals['itz_state'])
        return super().write(vals)

    def unlink(self):
        for lot in self:
            if lot.sudo().quant_ids.filtered(lambda q: q.quantity) or self.env['stock.move.line'].sudo().search_count([('lot_id', '=', lot.id)]):
                raise UserError(_('%s has stock movements and cannot be deleted. Archive or mark it as damaged instead.', lot.display_name))
        return super().unlink()

    # ---------------------------------------------------------------- actions
    def _itz_set_state(self, state, note='', event_type=None, technician=None, vehicle=None, installation=None):
        """Change the device status and write a history event + audit entry."""
        for lot in self:
            vals = {'itz_state': state}
            if technician is not None:
                vals['itz_technician_user_id'] = technician.id if technician else False
            old = lot.itz_state
            lot.with_context(itz_state_internal=True).write(vals)
            if old != state or note:
                event_vals = {
                    'lot_id': lot.id,
                    'event_type': event_type or 'status',
                    'old_state': old,
                    'new_state': state,
                    'note': note,
                    'technician_id': technician.id if technician else False,
                }
                Event = self.env['itz.device.event']
                if vehicle and 'vehicle_id' in Event._fields:
                    event_vals['vehicle_id'] = vehicle.id
                if installation and 'installation_id' in Event._fields:
                    event_vals['installation_id'] = installation.id
                Event.create(event_vals)
        return True

    def action_mark_available(self):
        self._check_storekeeper()
        for lot in self:
            if lot.itz_state not in ('returned', 'damaged', 'warranty', 'available'):
                raise UserError(_('%(lot)s is %(state)s. Only returned, damaged or warranty devices can be put back in stock.', lot=lot.display_name, state=dict(DEVICE_STATES)[lot.itz_state]))
        self.sudo()._itz_set_state('available', note=_('Checked and put back in stock'), event_type='status', technician=self.env['res.users'])

    def action_mark_warranty(self):
        self._check_storekeeper()
        self.sudo()._itz_set_state('warranty', note=_('Sent for warranty claim'), event_type='status')

    def action_mark_damaged(self):
        self._check_storekeeper()
        for lot in self:
            lot.sudo()._itz_set_state('damaged', note=_('Marked as damaged'), event_type='damage')

    def _check_storekeeper(self):
        if not self.env.user.has_group('itz_base.group_itz_storekeeper') and not self.env.user.has_group('itz_base.group_itz_ops_manager'):
            raise UserError(_('Only the storekeeper or an operations manager can change the stock status of a device.'))

    def action_view_events(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('History'), 'res_model': 'itz.device.event',
            'view_mode': 'list,form', 'domain': [('lot_id', '=', self.id)], 'context': {'default_lot_id': self.id},
        }

    def action_issue_to_technician(self):
        return {
            'type': 'ir.actions.act_window', 'name': _('Issue to technician'), 'res_model': 'itz.issue.technician',
            'view_mode': 'form', 'target': 'new',
            'context': {'default_lot_ids': [(6, 0, self.ids)], 'default_mode': 'issue'},
        }

    @api.model
    def itz_search_global(self, text):
        """Search a device or SIM by IMEI, serial, phone number or ICCID."""
        text = (text or '').strip()
        if not text:
            return self.browse()
        return self.search(['|', '|', '|', ('name', 'ilike', text), ('itz_imei', 'ilike', text), ('itz_msisdn', 'ilike', text), ('ref', 'ilike', text)], limit=50)
