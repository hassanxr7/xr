from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

INSTALL_TYPES = [
    ('install', 'New installation'),
    ('replace', 'Device replacement'),
    ('remove', 'Device removal'),
    ('move', 'Move to another vehicle'),
    ('maintenance', 'Maintenance / repair'),
]
TECH_WRITABLE = {
    'notes', 'location_note', 'photo_ids', 'line_ids', 'customer_confirmed_by', 'customer_phone_confirm',
    'customer_signature', 'confirmation_date', 'date_start', 'message_follower_ids', 'message_ids',
    'activity_ids', 'odometer', 'latitude', 'longitude',
}


class ItzInstallation(models.Model):
    _name = 'itz.installation'
    _description = 'Installation job'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'itz.audit.mixin']
    _order = 'date_planned desc, id desc'

    _itz_audit_fields = ['state', 'technician_id', 'date_planned', 'vehicle_id', 'partner_id', 'job_type']
    _itz_audit_category = 'installation'

    name = fields.Char(string='Reference', readonly=True, copy=False, default=lambda self: _('New'), index=True)
    state = fields.Selection([
        ('draft', 'Draft'), ('scheduled', 'Scheduled'), ('in_progress', 'In progress'),
        ('done', 'Completed'), ('cancelled', 'Cancelled')], default='draft', tracking=True, index=True, copy=False)
    job_type = fields.Selection(INSTALL_TYPES, string='Job type', default='install', required=True, tracking=True)
    partner_id = fields.Many2one('res.partner', string='Customer', required=True, tracking=True, index=True,
                                 domain="[('parent_id', '=', False)]")
    vehicle_id = fields.Many2one('itz.vehicle', string='Vehicle', required=True, tracking=True, index=True,
                                 domain="[('partner_id', '=', partner_id)]")
    plate = fields.Char(related='vehicle_id.plate', store=True, string='Plate')
    technician_id = fields.Many2one('res.users', string='Technician', tracking=True, index=True,
                                    domain="[('itz_is_technician', '=', True)]")
    date_planned = fields.Datetime(string='Planned date', tracking=True)
    date_start = fields.Datetime(string='Started on', copy=False, readonly=True)
    date_done = fields.Datetime(string='Completed on', copy=False, readonly=True, tracking=True)
    location_address = fields.Char(string='Installation location', help='Address or landmark where the work is done.')
    location_note = fields.Char(string='Where on the vehicle', help='For example "behind the dashboard, left side".')
    latitude = fields.Float(digits=(10, 6))
    longitude = fields.Float(digits=(10, 6))
    odometer = fields.Float(string='Odometer (km)')
    notes = fields.Text(string='Notes')
    line_ids = fields.One2many('itz.installation.line', 'installation_id', string='Equipment', copy=True)
    photo_ids = fields.One2many('itz.installation.photo', 'installation_id', string='Photos')
    photo_count = fields.Integer(compute='_compute_photo_count')
    customer_confirmed_by = fields.Char(string='Confirmed by (customer)')
    customer_phone_confirm = fields.Char(string='Confirmation phone')
    customer_signature = fields.Binary(string='Customer signature', attachment=True, copy=False)
    confirmation_date = fields.Datetime(string='Confirmation time', copy=False)
    warranty_months = fields.Integer(string='Warranty (months)', compute='_compute_warranty', store=True, readonly=False)
    warranty_end = fields.Date(string='Warranty ends', compute='_compute_warranty', store=True)
    picking_ids = fields.Many2many('stock.picking', string='Stock transfers', copy=False, readonly=True)
    equipment_ready = fields.Boolean(compute='_compute_equipment_ready', string='Equipment with technician')
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)
    color = fields.Integer()
    is_late = fields.Boolean(compute='_compute_is_late', search='_search_is_late')
    is_tech_only = fields.Boolean(compute='_compute_is_tech_only', help='The signed-in person is a technician without any office role: header fields are read-only for them.')

    # ----------------------------------------------------------------- computes
    @api.depends('photo_ids')
    def _compute_photo_count(self):
        for rec in self:
            rec.photo_count = len(rec.photo_ids)

    @api.depends('line_ids.lot_id', 'line_ids.action', 'date_done')
    def _compute_warranty(self):
        for rec in self:
            installs = rec.line_ids.filtered(lambda l: l.action == 'install' and l.lot_id)
            months = max(installs.mapped('lot_id.itz_warranty_months') or [0])
            if not rec.warranty_months or not rec.id:
                rec.warranty_months = months
            base = rec.date_done.date() if rec.date_done else False
            rec.warranty_end = fields.Date.add(base, months=rec.warranty_months) if base and rec.warranty_months else False

    @api.depends('line_ids.lot_id', 'line_ids.action', 'line_ids.state_ok', 'technician_id')
    def _compute_equipment_ready(self):
        for rec in self:
            lines = rec.line_ids.filtered(lambda l: l.action == 'install')
            rec.equipment_ready = bool(lines) and all(l.state_ok for l in lines)

    def _compute_is_tech_only(self):
        tech_only = self.env.user.has_group('itz_base.group_itz_technician') and not self.env.user.has_group('itz_base.group_itz_see_all')
        for rec in self:
            rec.is_tech_only = tech_only

    def _compute_is_late(self):
        now = fields.Datetime.now()
        for rec in self:
            rec.is_late = bool(rec.state in ('draft', 'scheduled', 'in_progress') and rec.date_planned and rec.date_planned < now)

    def _search_is_late(self, operator, value):
        now = fields.Datetime.now()
        positive = (operator == '=' and value) or (operator == '!=' and not value)
        dom = [('state', 'in', ('draft', 'scheduled', 'in_progress')), ('date_planned', '<', now)]
        if positive:
            return dom
        return ['|', ('state', 'in', ('done', 'cancelled')), '|', ('date_planned', '=', False), ('date_planned', '>=', now)]

    # --------------------------------------------------------------- constraints
    @api.constrains('vehicle_id', 'partner_id')
    def _check_vehicle_owner(self):
        for rec in self:
            if rec.vehicle_id.partner_id != rec.partner_id:
                raise ValidationError(_('Vehicle %(v)s belongs to %(p)s, not to %(c)s.', v=rec.vehicle_id.plate, p=rec.vehicle_id.partner_id.name, c=rec.partner_id.name))

    # --------------------------------------------------------------------- ORM
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') or vals['name'] == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('itz.installation') or _('New')
        return super().create(vals_list)

    @api.onchange('partner_id')
    def _onchange_partner(self):
        if self.vehicle_id and self.vehicle_id.partner_id != self.partner_id:
            self.vehicle_id = False

    @api.onchange('vehicle_id')
    def _onchange_vehicle(self):
        if self.vehicle_id:
            self.partner_id = self.vehicle_id.partner_id

    def write(self, vals):
        user = self.env.user
        if (not self.env.su and user.has_group('itz_base.group_itz_technician')
                and not user.has_group('itz_base.group_itz_ops_manager') and not user.has_group('itz_base.group_itz_support')
                and not user.has_group('itz_base.group_itz_sales')):
            forbidden = set(vals) - TECH_WRITABLE
            if forbidden:
                raise UserError(_('Technicians cannot change: %s', ', '.join(sorted(self._fields[f].string for f in forbidden if f in self._fields))))
        return super().write(vals)

    def unlink(self):
        for rec in self:
            if rec.state not in ('draft', 'cancelled'):
                raise UserError(_('Only draft or cancelled installations can be deleted.'))
        return super().unlink()

    # ------------------------------------------------------------------ actions
    def _check_unique_equipment(self):
        """A device or SIM can only be on one open job, and only once on a job."""
        for rec in self:
            used = []
            for line in rec.line_ids.filtered(lambda l: l.action == 'install'):
                used += [lot for lot in (line.lot_id, line.sim_lot_id) if lot]
            seen = set()
            for lot in used:
                if lot.id in seen:
                    raise UserError(_('%(lot)s is listed twice on %(job)s.', lot=lot.display_name, job=rec.name))
                seen.add(lot.id)
            others = self.sudo().search([('id', '!=', rec.id), ('state', 'in', ('scheduled', 'in_progress'))]).line_ids.filtered(lambda l: l.action == 'install')
            clash = {lot.id for lot in (others.lot_id | others.sim_lot_id)} & seen
            if clash:
                lot = self.env['stock.lot'].sudo().browse(sorted(clash)[0])
                raise UserError(_('%(lot)s is already planned on another open installation job.', lot=lot.display_name))

    def action_schedule(self):
        self._check_unique_equipment()
        for rec in self:
            if not rec.technician_id:
                raise UserError(_('Choose the technician before scheduling %s.', rec.name))
            if not rec.date_planned:
                raise UserError(_('Choose the planned date before scheduling %s.', rec.name))
            if not rec.line_ids:
                raise UserError(_('Add the equipment for %s.', rec.name))
            rec.state = 'scheduled'
            rec.activity_schedule('mail.mail_activity_data_todo', date_deadline=rec.date_planned.date(),
                                  summary=_('Installation %s', rec.name), user_id=rec.technician_id.id,
                                  note=_('Vehicle %(plate)s for %(cust)s', plate=rec.plate, cust=rec.partner_id.name))
        return True

    def action_start(self):
        for rec in self:
            if rec.state != 'scheduled':
                raise UserError(_('%s must be scheduled before it can be started.', rec.name))
            if self.env.user.has_group('itz_base.group_itz_technician') and rec.technician_id != self.env.user \
                    and not self.env.user.has_group('itz_base.group_itz_ops_manager'):
                raise UserError(_('Only the assigned technician can start this job.'))
            rec.sudo().write({'state': 'in_progress', 'date_start': fields.Datetime.now()})
        return True

    def action_cancel(self):
        for rec in self:
            if rec.state == 'done':
                raise UserError(_('A completed installation cannot be cancelled. Create a removal job instead.'))
            rec.state = 'cancelled'
            rec.activity_unlink(['mail.mail_activity_data_todo'])
        return True

    def action_draft(self):
        self.filtered(lambda r: r.state == 'cancelled').write({'state': 'draft'})

    def action_issue_equipment(self):
        """Open the issue wizard pre-filled with the equipment of this job."""
        self.ensure_one()
        lots = self.line_ids.filtered(lambda l: l.action == 'install').mapped('lot_id') | self.line_ids.mapped('sim_lot_id')
        lines = []
        for line in self.line_ids.filtered(lambda l: l.action == 'install'):
            if line.lot_id and line.lot_id.itz_state in ('available', 'reserved'):
                lines.append((0, 0, {'product_id': line.product_id.id, 'lot_id': line.lot_id.id, 'quantity': 1}))
            elif not line.lot_id and line.product_id.tracking == 'none' and line.quantity:
                lines.append((0, 0, {'product_id': line.product_id.id, 'quantity': line.quantity}))
            if line.sim_lot_id and line.sim_lot_id.itz_state in ('available', 'reserved'):
                lines.append((0, 0, {'product_id': line.sim_lot_id.product_id.id, 'lot_id': line.sim_lot_id.id, 'quantity': 1}))
        return {
            'type': 'ir.actions.act_window', 'name': _('Issue equipment'), 'res_model': 'itz.issue.technician',
            'view_mode': 'form', 'target': 'new',
            'context': {'default_mode': 'issue', 'default_technician_id': self.technician_id.id, 'default_line_ids': lines},
        }

    def action_done(self):
        for rec in self:
            rec.sudo()._check_can_complete()
        for rec in self:
            rec = rec.sudo()
            rec._complete_stock()
            rec._complete_devices()
            rec.write({'state': 'done', 'date_done': fields.Datetime.now()})
            rec.message_post(body=_('Installation completed. %s', rec._itz_summary()))
            self.env['itz.audit.log'].log('installation', 'Installation completed', rec, rec._itz_summary())
            rec._itz_after_done()
            rec.activity_unlink(['mail.mail_activity_data_todo'])
        return True

    def _itz_summary(self):
        self.ensure_one()
        parts = []
        for l in self.line_ids:
            what = l.lot_id.name or l.product_id.display_name
            parts.append('%s %s%s' % ('+' if l.action == 'install' else '-', what, (' (SIM %s)' % l.sim_lot_id.name) if l.sim_lot_id else ''))
        return '%s: %s' % (self.vehicle_id.plate, ', '.join(parts))

    def _itz_after_done(self):
        """Extension point: subscriptions, sales delivery, tasks."""
        return True

    # ---------------------------------------------------------------- checks
    def _check_can_complete(self):
        self.ensure_one()
        company = self.company_id
        if self.state not in ('scheduled', 'in_progress'):
            raise UserError(_('%s must be scheduled or in progress to be completed.', self.name))
        user = self.env.user
        if user.has_group('itz_base.group_itz_technician') and not user.has_group('itz_base.group_itz_ops_manager') \
                and self.technician_id != user:
            raise UserError(_('Only the assigned technician can complete this job.'))
        if not self.technician_id:
            raise UserError(_('No technician assigned.'))
        if not self.line_ids:
            raise UserError(_('Add the installed or removed equipment.'))
        self._check_unique_equipment()
        for line in self.line_ids:
            line._check_line()
        if company.itz_require_customer_confirmation and not (self.customer_confirmed_by or self.customer_signature):
            raise UserError(_('Customer confirmation is required: enter the name of the person who confirmed or capture a signature.'))
        if company.itz_require_photos and not self.photo_ids:
            raise UserError(_('Add at least one photo of the installation.'))

    # ------------------------------------------------------------------ stock
    def _tech_location(self):
        self.ensure_one()
        emp = self.env['hr.employee'].sudo().search([('user_id', '=', self.technician_id.id), ('itz_is_technician', '=', True)], limit=1)
        if not emp.itz_stock_location_id:
            raise UserError(_('%s has no technician stock location.', self.technician_id.name))
        return emp.itz_stock_location_id

    def _itz_move_vals(self, line, picking, src, dst):
        """Values of one stock.move for an installation line (extended by sales for the SO link)."""
        product = line.product_id
        return {
            'name': '%s - %s' % (self.name, product.display_name), 'product_id': product.id,
            'product_uom_qty': line.quantity, 'product_uom': product.uom_id.id, 'picking_id': picking.id,
            'location_id': src.id, 'location_dest_id': dst.id, 'picking_type_id': picking.picking_type_id.id,
            'partner_id': self.partner_id.id,
        }

    def _complete_stock(self):
        """Take installed items out of the technician's stock and bring removed items back to the technician."""
        self.ensure_one()
        tech_loc = self._tech_location()
        customer_loc = self.env.ref('stock.stock_location_customers')
        wh = self.env['stock.warehouse'].search([('company_id', '=', self.company_id.id)], limit=1)
        pickings = self.env['stock.picking']
        out_items, in_items = [], []
        for line in self.line_ids:
            if not line.product_id.itz_is_stockable:
                continue
            if line.action == 'install':
                out_items.append((line, line.lot_id))
                if line.sim_lot_id:
                    out_items.append((line._sim_line(), line.sim_lot_id))
            else:
                in_items.append((line, line.lot_id))
        for items, kind in ((out_items, 'out'), (in_items, 'in')):
            if not items:
                continue
            src, dst = (tech_loc, customer_loc) if kind == 'out' else (customer_loc, tech_loc)
            ptype = wh.out_type_id if kind == 'out' else wh.in_type_id
            picking = self.env['stock.picking'].create({
                'picking_type_id': ptype.id, 'partner_id': self.partner_id.id, 'location_id': src.id, 'location_dest_id': dst.id,
                'origin': self.name, 'itz_technician_user_id': self.technician_id.id,
            })
            for line, lot in items:
                product = line.product_id
                move = self.env['stock.move'].create(self._itz_move_vals(line, picking, src, dst))
                self.env['stock.move.line'].create({
                    'move_id': move.id, 'picking_id': picking.id, 'product_id': product.id,
                    'lot_id': lot.id or False, 'quantity': line.quantity, 'picked': True,
                    'location_id': src.id, 'location_dest_id': dst.id,
                })
            picking.action_confirm()
            picking.with_context(skip_backorder=True, skip_sms=True, skip_immediate=True).button_validate()
            if picking.state != 'done':
                raise UserError(_('The stock transfer %(p)s could not be completed (state %(s)s).', p=picking.name, s=picking.state))
            pickings |= picking
        self.picking_ids = [(6, 0, pickings.ids)]

    def _complete_devices(self):
        """Update device/SIM status, vehicle link, warranty and history."""
        self.ensure_one()
        now = fields.Datetime.now()
        vehicle = self.vehicle_id
        ev_type = {'install': 'install', 'replace': 'replace', 'move': 'move', 'maintenance': 'install', 'remove': 'remove'}[self.job_type]
        for line in self.line_ids:
            lot = line.lot_id
            if not lot:
                continue
            if line.action == 'install':
                vals = {'itz_vehicle_id': vehicle.id, 'itz_warranty_start': fields.Date.context_today(self)}
                if line.sim_lot_id:
                    vals['itz_sim_lot_id'] = line.sim_lot_id.id
                lot.write(vals)
                lot._itz_set_state('installed', note=_('Installed on %(plate)s (%(job)s)', plate=vehicle.plate, job=self.name),
                                   event_type=ev_type if ev_type != 'remove' else 'install', technician=self.env['res.users'],
                                   vehicle=vehicle, installation=self)
                if line.sim_lot_id:
                    line.sim_lot_id.write({'itz_vehicle_id': vehicle.id})
                    line.sim_lot_id._itz_set_state('installed', note=_('Installed in %s', lot.name), event_type='install',
                                                   technician=self.env['res.users'], vehicle=vehicle, installation=self)
            else:
                lot.write({'itz_vehicle_id': False})
                lot._itz_set_state('returned', note=_('Removed from %(plate)s (%(job)s)', plate=vehicle.plate, job=self.name),
                                   event_type='remove', technician=self.technician_id, vehicle=vehicle, installation=self)
                sim = lot.itz_sim_lot_id
                if line.remove_sim and sim:
                    sim.write({'itz_vehicle_id': False})
                    lot.write({'itz_sim_lot_id': False})
                    sim._itz_set_state('returned', note=_('Removed from %s', lot.name), event_type='remove',
                                       technician=self.technician_id, vehicle=vehicle, installation=self)

    def action_view_photos(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Photos'), 'res_model': 'itz.installation.photo',
            'view_mode': 'kanban,list,form', 'domain': [('installation_id', '=', self.id)],
            'context': {'default_installation_id': self.id},
        }

    def action_view_pickings(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Stock transfers'), 'res_model': 'stock.picking',
            'view_mode': 'list,form', 'domain': [('id', 'in', self.picking_ids.ids)],
        }


class ItzInstallationLine(models.Model):
    _name = 'itz.installation.line'
    _description = 'Installation equipment line'
    _order = 'sequence, id'

    installation_id = fields.Many2one('itz.installation', required=True, ondelete='cascade', index=True)
    sequence = fields.Integer(default=10)
    action = fields.Selection([('install', 'Install'), ('remove', 'Remove')], default='install', required=True)
    product_id = fields.Many2one('product.product', required=True, domain="[('itz_is_stockable', '=', True)]")
    tracking = fields.Selection(related='product_id.tracking')
    lot_id = fields.Many2one('stock.lot', string='IMEI / Serial', domain="[('product_id', '=', product_id)]")
    sim_lot_id = fields.Many2one('stock.lot', string='SIM card', domain="[('itz_category', '=', 'sim')]")
    remove_sim = fields.Boolean(string='Also remove SIM')
    quantity = fields.Float(default=1.0, required=True)
    state_ok = fields.Boolean(compute='_compute_state_ok', string='With technician')
    vehicle_plate = fields.Char(related='installation_id.plate')

    @api.depends('lot_id', 'product_id', 'quantity', 'action', 'sim_lot_id', 'installation_id.technician_id', 'lot_id.itz_state', 'lot_id.itz_technician_user_id', 'sim_lot_id.itz_state')
    def _compute_state_ok(self):
        for line in self:
            tech = line.installation_id.technician_id
            ok = True
            if line.action == 'install':
                if line.lot_id:
                    ok = line.lot_id.itz_state == 'issued' and line.lot_id.itz_technician_user_id == tech
                if ok and line.sim_lot_id:
                    ok = line.sim_lot_id.itz_state == 'issued' and line.sim_lot_id.itz_technician_user_id == tech
                if ok and not line.lot_id and line.product_id.tracking == 'none' and tech:
                    loc = self.env['hr.employee'].sudo().search([('user_id', '=', tech.id)], limit=1).itz_stock_location_id
                    qty = sum(self.env['stock.quant'].sudo().search([('product_id', '=', line.product_id.id), ('location_id', '=', loc.id)]).mapped('quantity')) if loc else 0
                    ok = qty >= line.quantity
            line.state_ok = ok

    @api.onchange('lot_id')
    def _onchange_lot_id(self):
        if self.lot_id:
            self.product_id = self.lot_id.product_id
            self.quantity = 1.0
            if self.action == 'install' and self.lot_id.itz_sim_lot_id:
                self.sim_lot_id = self.lot_id.itz_sim_lot_id

    @api.constrains('quantity')
    def _check_qty(self):
        for line in self:
            if line.quantity <= 0:
                raise ValidationError(_('Quantity must be positive.'))
            if line.tracking == 'serial' and line.quantity != 1:
                raise ValidationError(_('Serial-numbered items are installed one at a time.'))

    def _sim_line(self):
        """A pseudo-line for the SIM that goes into the device (used to build the stock move)."""
        self.ensure_one()
        return self.new({'product_id': self.sim_lot_id.product_id.id, 'quantity': 1.0, 'lot_id': self.sim_lot_id.id,
                         'installation_id': self.installation_id.id, 'action': 'install'})

    def _check_line(self):
        self.ensure_one()
        inst = self.installation_id
        product = self.product_id
        if product.tracking != 'none' and not self.lot_id:
            raise UserError(_('Select the IMEI / serial number for %s.', product.display_name))
        if self.action == 'install':
            if self.lot_id:
                lot = self.lot_id
                if lot.itz_state != 'issued' or lot.itz_technician_user_id != inst.technician_id:
                    raise UserError(_('%(lot)s is not in %(tech)s\'s stock (status: %(st)s). The storekeeper must issue it to the technician first.',
                                      lot=lot.display_name, tech=inst.technician_id.name,
                                      st=dict(lot._fields['itz_state'].selection).get(lot.itz_state)))
                if lot.itz_vehicle_id and lot.itz_vehicle_id != inst.vehicle_id:
                    raise UserError(_('%(lot)s is still installed on %(veh)s.', lot=lot.display_name, veh=lot.itz_vehicle_id.plate))
            elif not self.state_ok:
                raise UserError(_('%s is not available in the technician\'s stock.', product.display_name))
            if self.sim_lot_id:
                sim = self.sim_lot_id
                if sim.itz_state != 'issued' or sim.itz_technician_user_id != inst.technician_id:
                    raise UserError(_('SIM %s has not been issued to the technician.', sim.display_name))
        else:
            if not self.lot_id:
                raise UserError(_('Select the device that is removed.'))
            if self.lot_id.itz_vehicle_id != inst.vehicle_id:
                raise UserError(_('%(lot)s is not installed on %(veh)s.', lot=self.lot_id.display_name, veh=inst.vehicle_id.plate))


class ItzInstallationPhoto(models.Model):
    _name = 'itz.installation.photo'
    _description = 'Installation photo'
    _order = 'id'

    installation_id = fields.Many2one('itz.installation', required=True, ondelete='cascade', index=True)
    name = fields.Char(string='Caption', required=True, default=lambda self: _('Photo'))
    image = fields.Image(string='Photo', max_width=1600, max_height=1600, required=True)
    stage = fields.Selection([('before', 'Before'), ('during', 'During'), ('after', 'After'), ('other', 'Other')], default='after')
