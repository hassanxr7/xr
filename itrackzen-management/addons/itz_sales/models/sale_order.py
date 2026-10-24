from odoo import api, fields, models, _
from odoo.exceptions import UserError


class SaleOrder(models.Model):
    _name = 'sale.order'
    _inherit = ['sale.order', 'itz.audit.mixin']

    _itz_audit_fields = ['itz_approval_state', 'partner_id']
    _itz_audit_category = 'sales'

    itz_approval_state = fields.Selection(
        [('none', 'Not requested'), ('pending', 'Waiting for approval'), ('approved', 'Approved'), ('rejected', 'Rejected')],
        string='Approval', default='none', copy=False, tracking=True)
    itz_needs_approval = fields.Boolean(compute='_compute_itz_needs_approval', string='Approval needed')
    itz_requested_by_id = fields.Many2one('res.users', string='Approval requested by', copy=False, readonly=True)
    itz_approved_by_id = fields.Many2one('res.users', string='Approved by', copy=False, readonly=True, tracking=True)
    itz_approved_date = fields.Datetime(string='Approved on', copy=False, readonly=True)
    itz_reject_reason = fields.Text(string='Rejection reason', copy=False, readonly=True)
    itz_amount_hardware = fields.Monetary(string='Hardware', compute='_compute_itz_breakdown', currency_field='currency_id')
    itz_amount_installation = fields.Monetary(string='Installation and services', compute='_compute_itz_breakdown', currency_field='currency_id')
    itz_amount_recurring = fields.Monetary(string='Recurring plans (first period)', compute='_compute_itz_breakdown', currency_field='currency_id')
    itz_amount_other = fields.Monetary(string='Other', compute='_compute_itz_breakdown', currency_field='currency_id')
    itz_installation_ids = fields.One2many('itz.installation', 'sale_order_id', string='Installation jobs')
    itz_installation_count = fields.Integer(compute='_compute_itz_installation_count')
    itz_vehicle_ids = fields.Many2many('itz.vehicle', string='Vehicles', compute='_compute_itz_vehicles')

    # ------------------------------------------------------------------ computes
    @api.depends('order_line.price_subtotal', 'order_line.itz_charge_type')
    def _compute_itz_breakdown(self):
        for order in self:
            def total(kind):
                return sum(order.order_line.filtered(lambda l: l.itz_charge_type == kind and not l.display_type).mapped('price_subtotal'))
            order.itz_amount_hardware = total('hardware')
            order.itz_amount_installation = total('installation')
            order.itz_amount_recurring = total('recurring')
            order.itz_amount_other = order.amount_untaxed - order.itz_amount_hardware - order.itz_amount_installation - order.itz_amount_recurring

    @api.depends('itz_installation_ids')
    def _compute_itz_installation_count(self):
        for order in self:
            order.itz_installation_count = len(order.itz_installation_ids)

    @api.depends('order_line.itz_vehicle_id')
    def _compute_itz_vehicles(self):
        for order in self:
            order.itz_vehicle_ids = order.order_line.mapped('itz_vehicle_id')

    @api.depends('amount_total', 'order_line.discount', 'company_id')
    def _compute_itz_needs_approval(self):
        for order in self:
            order.itz_needs_approval = order._itz_needs_approval()

    def _itz_needs_approval(self):
        self.ensure_one()
        company = self.company_id
        if not company.itz_approval_required:
            return False
        if self.amount_total >= company.itz_approval_threshold:
            return True
        return any(l.discount > company.itz_max_discount_pct for l in self.order_line)

    # ------------------------------------------------------------------- approval
    def action_itz_request_approval(self):
        for order in self:
            if order.state not in ('draft', 'sent'):
                raise UserError(_('Only quotations can be sent for approval.'))
            if not order.order_line:
                raise UserError(_('Add at least one line before asking for approval.'))
            order.write({'itz_approval_state': 'pending', 'itz_requested_by_id': self.env.user.id, 'itz_reject_reason': False})
            approvers = self.env.ref('itz_base.group_itz_approver').users.filtered(lambda u: u.active and u != self.env.user)
            for user in approvers[:5]:
                order.activity_schedule('mail.mail_activity_data_todo', user_id=user.id, summary=_('Approve quotation %s', order.name),
                                        note=_('%(who)s asks you to approve %(name)s for %(cust)s, total %(amt)s.', who=self.env.user.name,
                                               name=order.name, cust=order.partner_id.name, amt=order.amount_total))
            self.env['itz.audit.log'].log('approval', 'Approval requested', order, '%s %s' % (order.partner_id.name, order.amount_total))
        return True

    def action_itz_approve(self):
        user = self.env.user
        if not user.has_group('itz_base.group_itz_approver'):
            raise UserError(_('You are not allowed to approve quotations.'))
        for order in self:
            if order.itz_approval_state != 'pending':
                raise UserError(_('%s is not waiting for approval.', order.name))
            if order.itz_requested_by_id == user and not user.has_group('itz_base.group_itz_owner'):
                raise UserError(_('You cannot approve your own request. Ask another approver.'))
            order.write({'itz_approval_state': 'approved', 'itz_approved_by_id': user.id, 'itz_approved_date': fields.Datetime.now()})
            order.activity_feedback(['mail.mail_activity_data_todo'])
            order.message_post(body=_('Approved by %s.', user.name))
            self.env['itz.audit.log'].log('approval', 'Quotation approved', order, '%s %s' % (order.partner_id.name, order.amount_total))
        return True

    def action_itz_reject(self, reason=''):
        user = self.env.user
        if not user.has_group('itz_base.group_itz_approver'):
            raise UserError(_('You are not allowed to reject quotations.'))
        for order in self:
            order.write({'itz_approval_state': 'rejected', 'itz_reject_reason': reason})
            order.activity_feedback(['mail.mail_activity_data_todo'])
            order.message_post(body=_('Rejected by %(who)s. %(why)s', who=user.name, why=reason or ''))
            self.env['itz.audit.log'].log('approval', 'Quotation rejected', order, reason)
        return True

    def action_itz_reject_wizard(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Reject quotation'), 'res_model': 'itz.reject.wizard',
                'view_mode': 'form', 'target': 'new', 'context': {'default_order_id': self.id}}

    def _itz_reset_approval(self, reason):
        for order in self:
            order.with_context(mail_notrack=True).write({'itz_approval_state': 'none', 'itz_approved_by_id': False, 'itz_approved_date': False})
            order.message_post(body=_('Approval cleared: %s. Request approval again.', reason))

    # ------------------------------------------------------------------- overrides
    def action_confirm(self):
        if not self.env.context.get('itz_skip_approval'):
            for order in self:
                if order._itz_needs_approval() and order.itz_approval_state != 'approved':
                    raise UserError(_('%s needs approval before it can be confirmed. Use "Request approval".', order.name))
        res = super().action_confirm()
        for order in self:
            self.env['itz.audit.log'].log('sales', 'Order confirmed', order, '%s %s' % (order.partner_id.name, order.amount_total))
            order.sudo()._itz_create_installations()
        return res

    def _create_invoices(self, grouped=False, final=False, date=None):
        if not self.env.su and not self.env.user.has_group('itz_base.group_itz_financial'):
            raise UserError(_('Only accountants and managers can create invoices.'))
        return super()._create_invoices(grouped=grouped, final=final, date=date)

    # ------------------------------------------------------------ installations
    def _itz_create_installations(self):
        Installation = self.env['itz.installation']
        for order in self:
            lines = order.order_line.filtered(lambda l: l.itz_vehicle_id and l.product_id.itz_fulfilment == 'installation' and not l.display_type)
            for vehicle in lines.mapped('itz_vehicle_id'):
                if order.itz_installation_ids.filtered(lambda i: i.vehicle_id == vehicle and i.state != 'cancelled'):
                    continue
                vals_lines = []
                for line in lines.filtered(lambda l: l.itz_vehicle_id == vehicle):
                    units = int(line.product_uom_qty) if line.product_id.tracking == 'serial' else 1
                    for _i in range(max(units, 1)):
                        vals_lines.append((0, 0, {
                            'product_id': line.product_id.id, 'sale_line_id': line.id, 'action': 'install',
                            'quantity': 1.0 if line.product_id.tracking == 'serial' else line.product_uom_qty,
                        }))
                inst = Installation.create({
                    'partner_id': order.partner_id.commercial_partner_id.id, 'vehicle_id': vehicle.id,
                    'sale_order_id': order.id, 'line_ids': vals_lines, 'job_type': 'install',
                    'notes': _('Created from %s', order.name),
                })
                order.message_post(body=_('Installation job %(job)s created for %(plate)s.', job=inst.name, plate=vehicle.plate))
        return True

    def action_itz_create_installation(self):
        """Create (or open) installation jobs from the order lines that have a vehicle."""
        self.ensure_one()
        if self.state != 'sale':
            raise UserError(_('Confirm the order first.'))
        before = len(self.itz_installation_ids)
        self.sudo()._itz_create_installations()
        if len(self.itz_installation_ids) == before and not self.itz_installation_ids:
            raise UserError(_('No order line has a vehicle. Choose the vehicle on the lines that are installed by a technician.'))
        return self.action_view_itz_installations()

    def action_view_itz_installations(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Installations'), 'res_model': 'itz.installation',
            'view_mode': 'list,form', 'domain': [('sale_order_id', '=', self.id)],
            'context': {'default_sale_order_id': self.id, 'default_partner_id': self.partner_id.commercial_partner_id.id},
        }
