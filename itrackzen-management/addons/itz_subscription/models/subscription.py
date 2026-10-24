from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError
from .product import CYCLES, CYCLE_MONTHS


class ItzSubscription(models.Model):
    _name = 'itz.subscription'
    _description = 'Vehicle tracking subscription'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'itz.audit.mixin']
    _order = 'next_renewal_date, id'

    _itz_audit_fields = ['state', 'plan_id', 'cycle', 'price', 'next_renewal_date']
    _itz_audit_category = 'subscription'

    name = fields.Char(string='Reference', copy=False, readonly=True, default=lambda self: _('New'), index=True)
    state = fields.Selection([
        ('draft', 'Waiting for installation'), ('active', 'Active'), ('suspended', 'Suspended'),
        ('expired', 'Expired'), ('cancelled', 'Cancelled')], default='draft', tracking=True, index=True, copy=False)
    partner_id = fields.Many2one('res.partner', string='Customer', required=True, index=True, tracking=True, domain="[('parent_id', '=', False)]")
    vehicle_id = fields.Many2one('itz.vehicle', string='Vehicle', required=True, index=True, tracking=True, domain="[('partner_id', '=', partner_id)]")
    plan_id = fields.Many2one('product.product', string='Plan', required=True, tracking=True, domain="[('itz_category', '=', 'plan')]")
    cycle = fields.Selection(CYCLES, string='Billing cycle', required=True, default='monthly', tracking=True)
    price = fields.Monetary(string='Price per cycle', currency_field='currency_id', required=True, tracking=True)
    currency_id = fields.Many2one('res.currency', default=lambda self: self.env.company.currency_id, required=True)
    sale_line_id = fields.Many2one('sale.order.line', string='Order line', copy=False, index=True, groups='itz_base.group_itz_see_all')
    sale_order_id = fields.Many2one('sale.order', string='Order', related='sale_line_id.order_id', store=True, groups='itz_base.group_itz_see_all')
    initial_cycles = fields.Integer(string='Cycles sold upfront', default=1, help='Number of cycles included in the first invoice.')
    activation_date = fields.Date(tracking=True, copy=False)
    next_renewal_date = fields.Date(string='Renewal date', tracking=True, copy=False, index=True,
                                    help='The paid period ends here. The next payment is due on or before this date.')
    expiry_date = fields.Date(string='Grace ends', compute='_compute_expiry_date', store=True)
    last_reminder_date = fields.Date(copy=False)
    period_ids = fields.One2many('itz.subscription.period', 'subscription_id', string='Billing periods')
    current_period_id = fields.Many2one('itz.subscription.period', compute='_compute_current_period', string='Current period')
    payment_status = fields.Selection(
        [('unbilled', 'Not invoiced'), ('unpaid', 'Unpaid'), ('partial', 'Partially paid'), ('paid', 'Paid'), ('overdue', 'Overdue')],
        compute='_compute_payment_status', store=True, string='Payment status', tracking=True)
    amount_due = fields.Monetary(compute='_compute_payment_status', store=True, currency_field='currency_id', string='Amount due',
                                 groups='itz_base.group_itz_financial')
    days_to_renewal = fields.Integer(compute='_compute_days_to_renewal', search='_search_days_to_renewal')
    renewal_state = fields.Selection([('ok', 'Paid up'), ('due', 'Renewal due soon'), ('late', 'Past due'), ('na', 'n/a')],
                                     compute='_compute_days_to_renewal', search='_search_renewal_state')
    note = fields.Text()
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)

    _sql_constraints = [
        ('cycles_positive', 'check(initial_cycles >= 1)', 'The number of upfront cycles must be at least 1.'),
    ]

    # ----------------------------------------------------------------- computes
    @api.depends('next_renewal_date', 'company_id.itz_grace_days')
    def _compute_expiry_date(self):
        for sub in self:
            sub.expiry_date = sub.next_renewal_date + relativedelta(days=sub.company_id.itz_grace_days) if sub.next_renewal_date else False

    @api.depends('period_ids.period_end', 'period_ids.state')
    def _compute_current_period(self):
        for sub in self:
            periods = sub.period_ids.filtered(lambda p: p.state != 'cancelled').sorted('period_start')
            current = periods.filtered(lambda p: p.state in ('unbilled', 'unpaid', 'partial', 'overdue'))[:1] or periods[-1:]
            sub.current_period_id = current

    @api.depends('period_ids.state', 'period_ids.amount_due', 'state')
    def _compute_payment_status(self):
        for sub in self:
            periods = sub.period_ids.filtered(lambda p: p.state != 'cancelled')
            unpaid = periods.filtered(lambda p: p.state in ('unbilled', 'unpaid', 'partial', 'overdue')).sorted('period_start')
            sub.amount_due = sum(unpaid.mapped('amount_due'))
            if sub.state == 'draft' and not periods:
                sub.payment_status = 'unbilled'
            elif unpaid:
                order = ['overdue', 'partial', 'unpaid', 'unbilled']
                sub.payment_status = min(unpaid.mapped('state'), key=order.index)
            elif periods:
                sub.payment_status = 'paid'
            else:
                sub.payment_status = 'unbilled'

    @api.depends('next_renewal_date', 'state')
    def _compute_days_to_renewal(self):
        today = fields.Date.context_today(self)
        for sub in self:
            if sub.next_renewal_date and sub.state in ('active', 'suspended', 'expired'):
                days = (sub.next_renewal_date - today).days
                sub.days_to_renewal = days
                remind = sub.company_id.itz_reminder_days
                sub.renewal_state = 'late' if days < 0 else ('due' if days <= remind else 'ok')
            else:
                sub.days_to_renewal = 0
                sub.renewal_state = 'na'

    def _search_days_to_renewal(self, operator, value):
        today = fields.Date.context_today(self)
        ops = {'<': '<', '<=': '<=', '>': '>', '>=': '>=', '=': '=', '!=': '!='}
        if operator not in ops or not isinstance(value, int):
            return [('id', '=', 0)]
        return [('state', 'in', ('active', 'suspended', 'expired')), ('next_renewal_date', operator, fields.Date.add(today, days=value))]

    def _search_renewal_state(self, operator, value):
        today = fields.Date.context_today(self)
        remind = self.env.company.itz_reminder_days
        live = [('state', 'in', ('active', 'suspended', 'expired')), ('next_renewal_date', '!=', False)]
        values = value if isinstance(value, (list, tuple)) else [value]
        doms = []
        for v in values:
            if v == 'late':
                doms.append(live + [('next_renewal_date', '<', today)])
            elif v == 'due':
                doms.append(live + [('next_renewal_date', '>=', today), ('next_renewal_date', '<=', fields.Date.add(today, days=remind))])
            elif v == 'ok':
                doms.append(live + [('next_renewal_date', '>', fields.Date.add(today, days=remind))])
        ids = self.search(doms[0]).ids if len(doms) == 1 else sum((self.search(d).ids for d in doms), [])
        return [('id', 'in' if operator in ('=', 'in') else 'not in', ids)]

    # ---------------------------------------------------------------------- ORM
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') or vals['name'] == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('itz.subscription') or _('New')
            if vals.get('plan_id'):
                plan = self.env['product.product'].browse(vals['plan_id'])
                vals.setdefault('cycle', plan.itz_plan_cycle or 'monthly')
                vals.setdefault('price', plan.lst_price)
        return super().create(vals_list)

    @api.constrains('vehicle_id', 'partner_id')
    def _check_vehicle_owner(self):
        for sub in self:
            if sub.vehicle_id.partner_id != sub.partner_id:
                raise ValidationError(_('Vehicle %(v)s does not belong to %(c)s.', v=sub.vehicle_id.plate, c=sub.partner_id.name))

    @api.onchange('plan_id')
    def _onchange_plan_id(self):
        if self.plan_id:
            self.cycle = self.plan_id.itz_plan_cycle or 'monthly'
            self.price = self.plan_id.lst_price

    def write(self, vals):
        if 'price' in vals and not self.env.su and not self.env.user.has_group('itz_base.group_itz_approver'):
            for sub in self:
                if sub.state != 'draft':
                    raise UserError(_('Only an approver can change the price of a running subscription.'))
        return super().write(vals)

    def unlink(self):
        for sub in self:
            if sub.state not in ('draft', 'cancelled'):
                raise UserError(_('Only draft or cancelled subscriptions can be deleted. Cancel it instead.'))
        return super().unlink()

    # ----------------------------------------------------------------- helpers
    def _cycle_months(self):
        self.ensure_one()
        return CYCLE_MONTHS[self.cycle]

    def _add_cycles(self, start, count=1):
        self.ensure_one()
        return start + relativedelta(months=self._cycle_months() * count)

    def _itz_platform_event(self, event):
        """Extension point: tell the tracking platform that a subscription changed (see itz_integration)."""
        return True

    # ------------------------------------------------------------- state changes
    def action_activate(self, date=None):
        """Start the subscription (normally called when the tracker is installed)."""
        today = date or fields.Date.context_today(self)
        for sub in self:
            if sub.state not in ('draft',):
                continue
            end = sub._add_cycles(today, sub.initial_cycles)
            sub.write({'state': 'active', 'activation_date': today, 'next_renewal_date': end})
            period = self.env['itz.subscription.period'].create({
                'subscription_id': sub.id, 'period_start': today, 'period_end': end,
                'cycles': sub.initial_cycles, 'amount': sub.price * sub.initial_cycles, 'kind': 'initial',
                'sale_line_id': sub.sale_line_id.id,
            })
            sub.message_post(body=_('Activated on %(d)s. First period %(p)s.', d=today, p=period.display_name))
            self.env['itz.audit.log'].log('subscription', 'Subscription activated', sub, '%s %s' % (sub.vehicle_id.plate, sub.plan_id.display_name))
        self._itz_platform_event('activated')
        return True

    def action_suspend(self):
        self.write({'state': 'suspended'})
        for sub in self:
            sub.message_post(body=_('Suspended by %s.', self.env.user.name))
            self.env['itz.audit.log'].log('subscription', 'Subscription suspended', sub, sub.vehicle_id.plate)
        self._itz_platform_event('suspended')

    def action_resume(self):
        for sub in self:
            if sub.state not in ('suspended', 'expired'):
                raise UserError(_('Only suspended or expired subscriptions can be resumed.'))
            if sub.sudo().amount_due and not self.env.user.has_group('itz_base.group_itz_approver'):
                raise UserError(_('%s still has an unpaid balance. Only an approver can resume it without payment.', sub.name))
            sub.write({'state': 'active'})
            sub.message_post(body=_('Resumed by %s.', self.env.user.name))
            self.env['itz.audit.log'].log('subscription', 'Subscription resumed', sub, sub.vehicle_id.plate)
        self._itz_platform_event('resumed')

    def action_cancel(self):
        for sub in self:
            sub.period_ids.filtered(lambda p: p.state == 'unbilled').write({'state': 'cancelled'})
            sub.state = 'cancelled'
            self.env['itz.audit.log'].log('subscription', 'Subscription cancelled', sub, sub.vehicle_id.plate)
        self._itz_platform_event('cancelled')

    def action_draft(self):
        self.filtered(lambda s: s.state == 'cancelled').write({'state': 'draft'})

    # -------------------------------------------------------------- billing
    def _create_renewal(self):
        """Create the next period and its invoice. Returns the new period."""
        self.ensure_one()
        Period = self.env['itz.subscription.period']
        start = self.next_renewal_date
        end = self._add_cycles(start, 1)
        period = Period.create({
            'subscription_id': self.id, 'period_start': start, 'period_end': end, 'cycles': 1,
            'amount': self.price, 'kind': 'renewal',
        })
        invoice = self.env['account.move'].with_company(self.company_id).create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_id.id,
            'invoice_date': fields.Date.context_today(self),
            'invoice_date_due': start,
            'invoice_origin': self.name,
            'itz_subscription_id': self.id,
            'invoice_user_id': self.sale_order_id.user_id.id if self.sale_order_id else False,
            'invoice_line_ids': [(0, 0, {
                'product_id': self.plan_id.id,
                'name': _('%(plan)s - %(plate)s (%(a)s to %(b)s)', plan=self.plan_id.display_name, plate=self.vehicle_id.plate,
                          a=fields.Date.to_string(start), b=fields.Date.to_string(end - relativedelta(days=1))),
                'quantity': 1.0,
                'price_unit': self.price,
            })],
        })
        period.invoice_id = invoice
        if self.company_id.itz_auto_post_renewals:
            invoice.action_post()
        self.message_post(body=_('Renewal invoice %(inv)s created for %(a)s to %(b)s.', inv=invoice.name or _('(draft)'), a=start, b=end))
        return period

    def action_create_renewal_invoice(self):
        self.ensure_one()
        if self.state not in ('active', 'suspended', 'expired'):
            raise UserError(_('Activate the subscription first.'))
        open_renewal = self.period_ids.filtered(lambda p: p.kind == 'renewal' and p.state in ('unpaid', 'partial', 'overdue', 'unbilled'))
        if open_renewal:
            raise UserError(_('There is already an unpaid renewal invoice (%s).', open_renewal[0].invoice_id.name or open_renewal[0].display_name))
        period = self._create_renewal()
        return period.action_open_invoice()

    # ------------------------------------------------------------------- crons
    @api.model
    def _cron_billing(self):
        today = fields.Date.context_today(self)
        for company in self.env['res.company'].search([]):
            lead = company.itz_invoice_lead_days
            subs = self.search([('state', 'in', ('active', 'expired', 'suspended')), ('company_id', '=', company.id),
                                ('next_renewal_date', '<=', fields.Date.add(today, days=lead))])
            for sub in subs:
                if sub.state == 'suspended':
                    continue
                if sub.period_ids.filtered(lambda p: p.kind == 'renewal' and p.state in ('unbilled', 'unpaid', 'partial', 'overdue')):
                    continue
                if sub.period_ids.filtered(lambda p: p.kind == 'renewal' and p.state != 'cancelled' and p.period_start == sub.next_renewal_date):
                    continue
                try:
                    with self.env.cr.savepoint():
                        sub._create_renewal()
                except Exception:  # noqa: BLE001 - one bad subscription must not stop the others
                    self.env['itz.audit.log'].log('subscription', 'Renewal invoice failed', sub, 'See server log')
                    import logging
                    logging.getLogger(__name__).exception('Renewal invoice failed for %s', sub.name)
        return True

    @api.model
    def _cron_reminders(self):
        today = fields.Date.context_today(self)
        template = self.env.ref('itz_subscription.mail_template_renewal_reminder')
        for company in self.env['res.company'].search([]):
            horizon = fields.Date.add(today, days=company.itz_reminder_days)
            subs = self.search([('state', '=', 'active'), ('company_id', '=', company.id),
                                ('next_renewal_date', '<=', horizon), ('next_renewal_date', '>=', today)])
            for sub in subs:
                if sub.last_reminder_date and (today - sub.last_reminder_date).days < 7:
                    continue
                if sub.partner_id.email:
                    template.send_mail(sub.id, force_send=False)
                sub.last_reminder_date = today
                responsible = sub.sale_order_id.user_id or self.env.ref('base.user_admin')
                sub.activity_schedule('mail.mail_activity_data_todo', user_id=responsible.id,
                                      date_deadline=sub.next_renewal_date, summary=_('Renewal due: %s', sub.vehicle_id.plate),
                                      note=_('%(c)s - %(p)s renews on %(d)s.', c=sub.partner_id.name, p=sub.plan_id.display_name, d=sub.next_renewal_date))
        return True

    @api.model
    def _cron_expire(self):
        today = fields.Date.context_today(self)
        template = self.env.ref('itz_subscription.mail_template_expired')
        for company in self.env['res.company'].search([('itz_auto_suspend', '=', True)]):
            subs = self.search([('state', '=', 'active'), ('company_id', '=', company.id), ('expiry_date', '<', today)])
            for sub in subs:
                sub.state = 'expired'
                sub.message_post(body=_('Expired: not renewed by %s.', sub.expiry_date))
                self.env['itz.audit.log'].log('subscription', 'Subscription expired', sub, sub.vehicle_id.plate)
                if sub.partner_id.email:
                    template.send_mail(sub.id, force_send=False)
            subs._itz_platform_event('expired')
        return True

    # -------------------------------------------------------------- UI helpers
    def action_view_invoices(self):
        self.ensure_one()
        invoices = self.period_ids.mapped('invoice_id')
        return {'type': 'ir.actions.act_window', 'name': _('Invoices'), 'res_model': 'account.move',
                'view_mode': 'list,form', 'domain': [('id', 'in', invoices.ids)]}

    def action_view_payments(self):
        self.ensure_one()
        invoices = self.period_ids.mapped('invoice_id')
        return {'type': 'ir.actions.act_window', 'name': _('Payments'), 'res_model': 'account.payment',
                'view_mode': 'list,form', 'domain': [('reconciled_invoice_ids', 'in', invoices.ids)]}

    def action_register_payment(self):
        self.ensure_one()
        invoice = self.period_ids.filtered(lambda p: p.invoice_id and p.invoice_id.payment_state in ('not_paid', 'partial') and p.invoice_id.state == 'posted')[:1].invoice_id
        if not invoice:
            raise UserError(_('There is no unpaid posted invoice for this subscription.'))
        return invoice.action_register_payment()



class ItzSubscriptionPeriod(models.Model):
    _name = 'itz.subscription.period'
    _description = 'Subscription billing period'
    _order = 'period_start desc, id desc'

    subscription_id = fields.Many2one('itz.subscription', required=True, ondelete='cascade', index=True)
    partner_id = fields.Many2one(related='subscription_id.partner_id', store=True)
    vehicle_id = fields.Many2one(related='subscription_id.vehicle_id', store=True)
    kind = fields.Selection([('initial', 'First period'), ('renewal', 'Renewal')], default='renewal', required=True)
    period_start = fields.Date(required=True)
    period_end = fields.Date(required=True)
    cycles = fields.Integer(default=1)
    amount = fields.Monetary(currency_field='currency_id')
    currency_id = fields.Many2one(related='subscription_id.currency_id')
    sale_line_id = fields.Many2one('sale.order.line', string='Order line', copy=False, groups='itz_base.group_itz_see_all')
    invoice_id = fields.Many2one('account.move', string='Invoice', copy=False, compute='_compute_invoice', store=True, readonly=False, groups='itz_base.group_itz_financial')
    invoice_state = fields.Selection(related='invoice_id.payment_state', string='Invoice payment state', groups='itz_base.group_itz_financial')
    state = fields.Selection([
        ('unbilled', 'Not invoiced'), ('unpaid', 'Unpaid'), ('partial', 'Partially paid'),
        ('overdue', 'Overdue'), ('paid', 'Paid'), ('cancelled', 'Cancelled')],
        compute='_compute_state', store=True, default='unbilled', index=True)
    amount_due = fields.Monetary(compute='_compute_state', store=True, currency_field='currency_id', groups='itz_base.group_itz_financial')
    paid_date = fields.Date(readonly=True, copy=False)

    @api.depends('sale_line_id.invoice_lines.move_id.state', 'sale_line_id.invoice_lines.move_id.payment_state')
    def _compute_invoice(self):
        for period in self.sudo():
            if period.kind == 'initial' and period.sale_line_id and not period.invoice_id:
                invoices = period.sale_line_id.invoice_lines.move_id.filtered(lambda m: m.state != 'cancel' and m.move_type == 'out_invoice')
                period.invoice_id = invoices[:1]

    @api.depends('invoice_id.payment_state', 'invoice_id.state', 'invoice_id.amount_residual', 'invoice_id.invoice_date_due', 'invoice_id.amount_total')
    def _compute_state(self):
        today = fields.Date.context_today(self)
        for period in self.sudo():
            inv = period.invoice_id
            if period.state == 'cancelled' and not inv:
                continue
            if not inv or inv.state == 'cancel':
                period.state = 'unbilled'
                period.amount_due = period.amount
            elif inv.state == 'draft':
                period.state = 'unbilled'
                period.amount_due = inv.amount_total
            elif inv.payment_state in ('paid', 'in_payment', 'reversed'):
                period.state = 'paid'
                period.amount_due = 0.0
            else:
                period.amount_due = inv.amount_residual
                if inv.invoice_date_due and inv.invoice_date_due < today:
                    period.state = 'overdue'
                elif inv.payment_state == 'partial':
                    period.state = 'partial'
                else:
                    period.state = 'unpaid'

    @api.depends('subscription_id.name', 'period_start', 'period_end')
    def _compute_display_name(self):
        for period in self:
            period.display_name = '%s: %s to %s' % (period.subscription_id.name, period.period_start, period.period_end)

    def action_open_invoice(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'res_model': 'account.move', 'res_id': self.invoice_id.id, 'view_mode': 'form'}

    def _on_invoice_paid(self):
        """Invoice paid in full: the subscription is covered until the end of this period."""
        for period in self:
            sub = period.subscription_id
            period.paid_date = fields.Date.context_today(self)
            if sub.state in ('cancelled', 'draft'):
                continue
            new_end = max(sub.next_renewal_date or period.period_end, period.period_end)
            vals = {'next_renewal_date': new_end}
            reactivated = sub.state in ('expired',)
            if reactivated:
                vals['state'] = 'active'
            sub.write(vals)
            sub.message_post(body=_('Payment received. Covered until %s.', new_end) + (_(' Subscription reactivated.') if reactivated else ''))
            self.env['itz.audit.log'].log('subscription', 'Subscription paid', sub, '%s until %s' % (sub.vehicle_id.plate, new_end))
            if reactivated:
                sub._itz_platform_event('resumed')
