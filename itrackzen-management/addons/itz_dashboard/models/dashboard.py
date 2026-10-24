from datetime import timedelta

from odoo import api, fields, models, _


class ItzDashboard(models.AbstractModel):
    """Data for the home dashboard. Everything is computed as the logged-in user, so record rules and
    access rights decide what each person sees. Tiles the user may not open are not returned at all."""
    _name = 'itz.dashboard'
    _description = 'ITrackZen dashboard'

    # ------------------------------------------------------------------ helpers
    def _has(self, *xmlids):
        return any(self.env.user.has_group(x) for x in xmlids)

    def _count(self, model, domain):
        try:
            return self.env[model].search_count(domain)
        except Exception:  # noqa: BLE001 - a tile the user may not read is simply left out
            return None

    def _sum(self, model, domain, field):
        try:
            data = self.env[model]._read_group(domain, [], [f'{field}:sum'])
            return data[0][0] or 0.0
        except Exception:  # noqa: BLE001
            return None

    def _tile(self, key, label, value, action=None, domain=None, model=None, icon='fa-circle', tone='default', hint='', money=False, group=None):
        if value is None:
            return None
        tile = {'key': key, 'label': label, 'value': value, 'icon': icon, 'tone': tone, 'hint': hint, 'money': money, 'group': group}
        if action:
            tile['action'] = action
        elif model:
            tile['res_model'] = model
            tile['domain'] = domain or []
        return tile

    def _xmlid_action(self, xmlid):
        act = self.env.ref(xmlid, raise_if_not_found=False)
        return act.id if act else False

    # ------------------------------------------------------------------ main
    @api.model
    def get_data(self):
        user = self.env.user
        today = fields.Date.context_today(self)
        now = fields.Datetime.now()
        month_start = today.replace(day=1)
        currency = self.env.company.currency_id
        sections = []

        def section(key, title, tiles, icon='fa-th'):
            tiles = [t for t in tiles if t]
            if tiles:
                sections.append({'key': key, 'title': title, 'icon': icon, 'tiles': tiles})

        # --- My work (everyone)
        my_open = [('assigned_user_id', '=', user.id), ('state', 'in', ('pending', 'in_progress'))]
        my_late = my_open + [('is_overdue', '=', True)]
        tiles = [
            self._tile('my_tasks', _('My open tasks'), self._count('itz.task', my_open), model='itz.task', domain=my_open, icon='fa-tasks'),
            self._tile('my_overdue', _('My overdue tasks'), self._count('itz.task', my_late), model='itz.task', domain=my_late, icon='fa-exclamation-triangle',
                       tone='danger'),
        ]
        if user.has_group('itz_base.group_itz_technician'):
            jobs = [('technician_id', '=', user.id), ('state', 'in', ('scheduled', 'in_progress'))]
            tiles += [
                self._tile('my_jobs', _('My installation jobs'), self._count('itz.installation', jobs), model='itz.installation', domain=jobs, icon='fa-wrench'),
                self._tile('my_equipment', _('Equipment with me'), self._count('stock.lot', [('itz_technician_user_id', '=', user.id)]),
                           model='stock.lot', domain=[('itz_technician_user_id', '=', user.id)], icon='fa-microchip'),
            ]
        section('mine', _('My work'), tiles, 'fa-user')

        # --- Sales
        if self._has('itz_base.group_itz_sales', 'itz_base.group_itz_ops_manager', 'itz_base.group_itz_readonly'):
            quotes = [('state', 'in', ('draft', 'sent'))]
            pending = [('itz_approval_state', '=', 'pending')]
            orders_m = [('state', '=', 'sale'), ('date_order', '>=', fields.Datetime.to_datetime(month_start))]
            new_enq = [('state', '=', 'new')]
            section('sales', _('Sales'), [
                self._tile('enq_new', _('New website enquiries'), self._count('itz.enquiry', new_enq), model='itz.enquiry', domain=new_enq, icon='fa-inbox', tone='warning'),
                self._tile('quotes', _('Open quotations'), self._count('sale.order', quotes), model='sale.order', domain=quotes, icon='fa-file-text-o'),
                self._tile('approvals', _('Waiting for approval'), self._count('sale.order', pending), model='sale.order', domain=pending, icon='fa-gavel',
                           tone='warning') if user.has_group('itz_base.group_itz_approver') else None,
                self._tile('orders_month', _('Orders this month'), self._count('sale.order', orders_m), model='sale.order', domain=orders_m, icon='fa-shopping-cart'),
                self._tile('sales_month', _('Sales this month'), self._sum('sale.order', orders_m, 'amount_untaxed'), model='sale.order', domain=orders_m,
                           icon='fa-line-chart', money=True) if user.has_group('itz_base.group_itz_financial') else None,
            ], 'fa-shopping-cart')

        # --- Inventory
        if self._has('itz_base.group_itz_storekeeper', 'itz_base.group_itz_ops_manager', 'itz_base.group_itz_sales', 'itz_base.group_itz_readonly'):
            dev = [('itz_category', 'in', ('tracker', 'dashcam'))]
            avail = dev + [('itz_state', '=', 'available')]
            issued = dev + [('itz_state', '=', 'issued')]
            installed = dev + [('itz_state', '=', 'installed')]
            problems = dev + [('itz_state', 'in', ('returned', 'damaged', 'warranty'))]
            sims = [('itz_category', '=', 'sim'), ('itz_state', '=', 'available')]
            low = [('itz_low_stock', '=', True)]
            section('inventory', _('Hardware stock'), [
                self._tile('dev_avail', _('Trackers and dashcams in stock'), self._count('stock.lot', avail), model='stock.lot', domain=avail, icon='fa-cubes', tone='success'),
                self._tile('dev_issued', _('With technicians'), self._count('stock.lot', issued), model='stock.lot', domain=issued, icon='fa-user-circle'),
                self._tile('dev_installed', _('Installed on vehicles'), self._count('stock.lot', installed), model='stock.lot', domain=installed, icon='fa-car'),
                self._tile('dev_problem', _('Returned, damaged or in warranty'), self._count('stock.lot', problems), model='stock.lot', domain=problems, icon='fa-wrench', tone='warning'),
                self._tile('sim_avail', _('SIM cards in stock'), self._count('stock.lot', sims), model='stock.lot', domain=sims, icon='fa-sim-card'),
                self._tile('low_stock', _('Low-stock products'), self._count('product.template', low), model='product.template', domain=low, icon='fa-exclamation-circle', tone='danger'),
            ], 'fa-cubes')

        # --- Installations
        if self._has('itz_base.group_itz_see_all', 'itz_base.group_itz_technician'):
            start = fields.Datetime.to_datetime(today)
            end = start + timedelta(days=1)
            todays = [('state', 'in', ('scheduled', 'in_progress')), ('date_planned', '>=', start), ('date_planned', '<', end)]
            late = [('is_late', '=', True)]
            active = [('state', 'in', ('scheduled', 'in_progress'))]
            done_m = [('state', '=', 'done'), ('date_done', '>=', fields.Datetime.to_datetime(month_start))]
            section('install', _('Installations'), [
                self._tile('inst_today', _('Scheduled today'), self._count('itz.installation', todays), model='itz.installation', domain=todays, icon='fa-calendar'),
                self._tile('inst_active', _('Open jobs'), self._count('itz.installation', active), model='itz.installation', domain=active, icon='fa-wrench'),
                self._tile('inst_late', _('Late jobs'), self._count('itz.installation', late), model='itz.installation', domain=late, icon='fa-clock-o', tone='danger'),
                self._tile('inst_done', _('Completed this month'), self._count('itz.installation', done_m), model='itz.installation', domain=done_m, icon='fa-check-circle', tone='success'),
            ], 'fa-wrench')

        # --- Subscriptions
        if self._has('itz_base.group_itz_see_all'):
            subs_active = [('state', '=', 'active')]
            due = [('state', 'in', ('active', 'suspended', 'expired')), ('renewal_state', '=', 'due')]
            late_s = [('state', 'in', ('active', 'suspended', 'expired')), ('renewal_state', '=', 'late')]
            expired = [('state', '=', 'expired')]
            unpaid_s = [('state', '!=', 'cancelled'), ('payment_status', 'in', ('unpaid', 'partial', 'overdue'))]
            section('subs', _('Subscriptions'), [
                self._tile('sub_active', _('Active subscriptions'), self._count('itz.subscription', subs_active), model='itz.subscription', domain=subs_active, icon='fa-refresh', tone='success'),
                self._tile('sub_due', _('Renewals due soon'), self._count('itz.subscription', due), model='itz.subscription', domain=due, icon='fa-bell', tone='warning'),
                self._tile('sub_late', _('Past renewal date'), self._count('itz.subscription', late_s), model='itz.subscription', domain=late_s, icon='fa-exclamation-triangle', tone='danger'),
                self._tile('sub_expired', _('Expired'), self._count('itz.subscription', expired), model='itz.subscription', domain=expired, icon='fa-ban', tone='danger'),
                self._tile('sub_unpaid', _('Unpaid or part-paid'), self._count('itz.subscription', unpaid_s), model='itz.subscription', domain=unpaid_s, icon='fa-credit-card', tone='warning'),
            ], 'fa-refresh')

        # --- Finance
        if user.has_group('itz_base.group_itz_financial'):
            unpaid = [('move_type', '=', 'out_invoice'), ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial'))]
            overdue = [('itz_is_overdue', '=', True)]
            paid_m = [('payment_type', '=', 'inbound'), ('partner_type', '=', 'customer'), ('state', 'in', ('in_process', 'paid')),
                      ('date', '>=', month_start)]
            section('finance', _('Finance'), [
                self._tile('inv_due', _('Outstanding balance'), self._sum('account.move', unpaid, 'amount_residual_signed'), model='account.move', domain=unpaid, icon='fa-money', money=True),
                self._tile('inv_overdue_amt', _('Overdue amount'), self._sum('account.move', overdue, 'amount_residual_signed'), model='account.move', domain=overdue, icon='fa-exclamation-triangle', money=True, tone='danger'),
                self._tile('inv_overdue', _('Overdue invoices'), self._count('account.move', overdue), model='account.move', domain=overdue, icon='fa-file-text-o', tone='danger'),
                self._tile('paid_month', _('Payments received this month'), self._sum('account.payment', paid_m, 'amount'), model='account.payment', domain=paid_m, icon='fa-credit-card', money=True, tone='success'),
            ], 'fa-money')

        # --- Team
        if user.has_group('itz_base.group_itz_ops_manager'):
            team_late = [('is_overdue', '=', True)]
            team_open = [('state', 'in', ('pending', 'in_progress'))]
            week_start = fields.Datetime.to_datetime(today - timedelta(days=today.weekday()))
            done_w = [('state', '=', 'completed'), ('date_done', '>=', week_start)]
            failed = [('state', '=', 'failed')]
            tiles = [
                self._tile('team_open', _('Open tasks (team)'), self._count('itz.task', team_open), model='itz.task', domain=team_open, icon='fa-users'),
                self._tile('team_late', _('Overdue tasks (team)'), self._count('itz.task', team_late), model='itz.task', domain=team_late, icon='fa-exclamation-triangle', tone='danger'),
                self._tile('team_done', _('Tasks completed this week'), self._count('itz.task', done_w), model='itz.task', domain=done_w, icon='fa-check-circle', tone='success'),
            ]
            if 'itz.sync.job' in self.env:
                tiles.append(self._tile('sync_failed', _('Platform sync failures'), self._count('itz.sync.job', failed), model='itz.sync.job', domain=failed, icon='fa-plug', tone='danger'))
            section('team', _('Team and system'), tiles, 'fa-users')

        return {
            'user': {'name': user.name, 'id': user.id},
            'roles': self._role_names(),
            'currency': {'symbol': currency.symbol, 'position': currency.position, 'decimals': currency.decimal_places},
            'sections': sections,
            'lists': self._lists(today),
            'links': self._links(),
            'date': fields.Date.to_string(today),
        }

    def _role_names(self):
        if self.env.user.has_group('itz_base.group_itz_owner'):
            return [self.env.ref('itz_base.group_itz_owner').name]
        cat = self.env.ref('itz_base.module_category_itz')
        return self.env.user.groups_id.filtered(lambda g: g.category_id == cat).mapped('name')

    def _links(self):
        """Links to the website admin (same workspace)."""
        icp = self.env['ir.config_parameter'].sudo()
        return {'website_admin': icp.get_param('itz.website_admin_url', ''), 'website': icp.get_param('itz.website_url', '')}

    def _lists(self, today):
        user = self.env.user
        lists = []
        # Today's installations
        if self._has('itz_base.group_itz_see_all', 'itz_base.group_itz_technician'):
            start = fields.Datetime.to_datetime(today)
            jobs = self.env['itz.installation'].search([('state', 'in', ('scheduled', 'in_progress')), ('date_planned', '<', start + timedelta(days=2))], order='date_planned', limit=8)
            lists.append({'key': 'jobs', 'title': _('Next installations'), 'model': 'itz.installation', 'rows': [
                {'id': j.id, 'title': '%s  %s' % (j.plate, j.partner_id.name), 'sub': '%s - %s' % (fields.Datetime.to_string(j.date_planned)[:16] if j.date_planned else '', j.technician_id.name or _('No technician')),
                 'badge': j.state, 'late': j.is_late} for j in jobs]})
        # Renewals due
        if self._has('itz_base.group_itz_see_all'):
            subs = self.env['itz.subscription'].search([('state', 'in', ('active', 'suspended', 'expired')), ('renewal_state', 'in', ('due', 'late'))], order='next_renewal_date', limit=8)
            lists.append({'key': 'subs', 'title': _('Renewals to follow up'), 'model': 'itz.subscription', 'rows': [
                {'id': s.id, 'title': '%s  %s' % (s.vehicle_id.plate, s.partner_id.name), 'sub': _('Renews %s', s.next_renewal_date), 'badge': s.renewal_state, 'late': s.renewal_state == 'late'} for s in subs]})
        # My tasks
        tasks = self.env['itz.task'].search([('assigned_user_id', '=', user.id), ('state', 'in', ('pending', 'in_progress'))], order='date_deadline', limit=8)
        lists.append({'key': 'tasks', 'title': _('My tasks'), 'model': 'itz.task', 'rows': [
            {'id': t.id, 'title': t.name, 'sub': fields.Datetime.to_string(t.date_deadline)[:16] if t.date_deadline else _('No deadline'), 'badge': t.display_status, 'late': t.is_overdue} for t in tasks]})
        # Overdue invoices
        if user.has_group('itz_base.group_itz_financial'):
            inv = self.env['account.move'].search([('itz_is_overdue', '=', True)], order='invoice_date_due', limit=8)
            lists.append({'key': 'invoices', 'title': _('Overdue invoices'), 'model': 'account.move', 'rows': [
                {'id': m.id, 'title': '%s  %s' % (m.name, m.partner_id.name), 'sub': _('%s days overdue - due %s', m.itz_days_overdue, m.amount_residual_signed),
                 'badge': 'overdue', 'late': True} for m in inv]})
        return [l for l in lists if l['rows']]

    # ------------------------------------------------------------------ search
    @api.model
    def search_global(self, text):
        """One box to find a customer, vehicle, device, SIM, installation or subscription by name, plate, phone, IMEI or serial."""
        text = (text or '').strip()
        if len(text) < 2:
            return []
        results = []

        def add(model, title, records, label, sub):
            rows = []
            for rec in records:
                rows.append({'id': rec.id, 'model': model, 'label': label(rec), 'sub': sub(rec)})
            if rows:
                results.append({'title': title, 'model': model, 'rows': rows})

        try:
            if self.env['itz.vehicle'].has_access('read'):
                norm = ''.join(ch for ch in text.upper() if ch.isalnum())
                veh = self.env['itz.vehicle'].search(['|', '|', '|', '|', '|',
                    ('plate', 'ilike', text), ('plate_norm', 'ilike', norm or text), ('partner_id.name', 'ilike', text),
                    ('partner_id.phone', 'ilike', text), ('device_ids.itz_imei', 'ilike', text), ('device_ids.name', 'ilike', text)], limit=8)
                add('itz.vehicle', _('Vehicles'), veh, lambda r: r.plate, lambda r: '%s - IMEI %s' % (r.partner_id.name, r.device_imei or '-'))
            if self.env['res.partner'].has_access('read'):
                par = self.env['res.partner'].search([('parent_id', '=', False), '|', '|', ('name', 'ilike', text), ('phone', 'ilike', text), ('email', 'ilike', text)], limit=6)
                add('res.partner', _('Customers'), par, lambda r: r.name, lambda r: r.phone or r.email or '')
            if self.env['stock.lot'].has_access('read'):
                lots = self.env['stock.lot'].search(['|', '|', ('name', 'ilike', text), ('itz_imei', 'ilike', text), ('itz_msisdn', 'ilike', text)], limit=6)
                add('stock.lot', _('Devices and SIM cards'), lots, lambda r: r.itz_imei or r.name,
                    lambda r: '%s - %s%s' % (r.product_id.display_name, dict(r._fields['itz_state'].selection).get(r.itz_state, ''), (' - ' + r.itz_vehicle_plate) if r.itz_vehicle_plate else ''))
            if self.env['itz.installation'].has_access('read'):
                ins = self.env['itz.installation'].search(['|', '|', ('name', 'ilike', text), ('plate', 'ilike', text), ('partner_id.name', 'ilike', text)], limit=5)
                add('itz.installation', _('Installations'), ins, lambda r: r.name, lambda r: '%s - %s' % (r.plate, dict(r._fields['state'].selection).get(r.state, '')))
            if 'itz.subscription' in self.env and self.env['itz.subscription'].has_access('read'):
                sub = self.env['itz.subscription'].search(['|', '|', ('name', 'ilike', text), ('vehicle_id.plate', 'ilike', text), ('partner_id.name', 'ilike', text)], limit=5)
                add('itz.subscription', _('Subscriptions'), sub, lambda r: r.name, lambda r: '%s - %s' % (r.vehicle_id.plate, dict(r._fields['state'].selection).get(r.state, '')))
        except Exception:  # noqa: BLE001
            pass
        return results
