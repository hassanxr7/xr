import io
from datetime import timedelta

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError

REPORTS = [
    # key, label, required group (None = any ITrackZen user), needs date range
    ('stock_availability', 'Stock availability', 'itz_base.group_itz_see_all', False),
    ('stock_movement', 'Stock movements', 'itz_base.group_itz_see_all', True),
    ('installed_devices', 'Installed devices', 'itz_base.group_itz_see_all', True),
    ('sales', 'Sales', 'itz_base.group_itz_financial', True),
    ('payments', 'Payments received', 'itz_base.group_itz_financial', True),
    ('outstanding', 'Outstanding invoices', 'itz_base.group_itz_financial', False),
    ('overdue', 'Overdue invoices', 'itz_base.group_itz_financial', False),
    ('subscriptions', 'Active subscriptions', 'itz_base.group_itz_see_all', False),
    ('renewals', 'Upcoming renewals', 'itz_base.group_itz_see_all', True),
    ('installations_tech', 'Installations by technician', 'itz_base.group_itz_see_all', True),
    ('maintenance_tech', 'Maintenance, removals and replacements by technician', 'itz_base.group_itz_see_all', True),
    ('employee_tasks', 'Employee tasks and completion', 'itz_base.group_itz_ops_manager', True),
]
PRESETS = [('custom', 'Custom dates'), ('this_month', 'This month'), ('last_month', 'Last month'), ('this_quarter', 'This quarter'),
           ('this_year', 'This year'), ('last_30', 'Last 30 days'), ('next_30', 'Next 30 days'), ('next_60', 'Next 60 days')]


class ItzReportWizard(models.TransientModel):
    _name = 'itz.report.wizard'
    _description = 'ITrackZen reports'

    report_type = fields.Selection([(k, l) for k, l, _g, _d in REPORTS], required=True, default='stock_availability', string='Report')
    preset = fields.Selection(PRESETS, default='this_month', string='Period')
    date_from = fields.Date()
    date_to = fields.Date()
    needs_dates = fields.Boolean(compute='_compute_needs_dates')
    technician_id = fields.Many2one('res.users', string='Technician', domain="[('employee_ids.itz_is_technician', '=', True)]")
    partner_id = fields.Many2one('res.partner', string='Customer', domain="[('parent_id', '=', False)]")
    preview_html = fields.Html(compute='_compute_preview_html', sanitize=False)

    @api.depends('report_type')
    def _compute_needs_dates(self):
        info = {k: d for k, _l, _g, d in REPORTS}
        for wiz in self:
            wiz.needs_dates = info.get(wiz.report_type, False)

    @api.onchange('preset')
    def _onchange_preset(self):
        today = fields.Date.context_today(self)
        p = self.preset
        if p == 'this_month':
            self.date_from, self.date_to = today.replace(day=1), today
        elif p == 'last_month':
            first = today.replace(day=1)
            self.date_to = first - timedelta(days=1)
            self.date_from = self.date_to.replace(day=1)
        elif p == 'this_quarter':
            q = (today.month - 1) // 3 * 3 + 1
            self.date_from, self.date_to = today.replace(month=q, day=1), today
        elif p == 'this_year':
            self.date_from, self.date_to = today.replace(month=1, day=1), today
        elif p == 'last_30':
            self.date_from, self.date_to = today - timedelta(days=30), today
        elif p == 'next_30':
            self.date_from, self.date_to = today, today + timedelta(days=30)
        elif p == 'next_60':
            self.date_from, self.date_to = today, today + timedelta(days=60)

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        today = fields.Date.context_today(self)
        res.setdefault('date_from', today.replace(day=1))
        res.setdefault('date_to', today)
        return res

    # ------------------------------------------------------------------ access
    def _check_report_access(self):
        self.ensure_one()
        info = {k: g for k, _l, g, _d in REPORTS}
        group = info[self.report_type]
        if not self.env.su and not self.env.user.has_group(group):
            raise AccessError(_('You are not allowed to run the "%s" report.', dict((k, l) for k, l, _g, _d in REPORTS)[self.report_type]))

    # ------------------------------------------------------------------ builders
    def get_report(self):
        """Return {'title', 'subtitle', 'columns': [{'label','type'}], 'rows': [[...]], 'totals': [...]}.
        Column types: text, int, float, money, date, datetime."""
        self.ensure_one()
        self._check_report_access()
        if self.needs_dates and (not self.date_from or not self.date_to or self.date_from > self.date_to):
            raise UserError(_('Choose a valid period.'))
        data = getattr(self, '_report_%s' % self.report_type)()
        label = dict((k, l) for k, l, _g, _d in REPORTS)[self.report_type]
        period = ''
        if self.needs_dates:
            period = '%s to %s' % (self.date_from, self.date_to)
        data.setdefault('title', label)
        data['subtitle'] = ' - '.join(filter(None, [period, self.technician_id.name, self.partner_id.name]))
        data.setdefault('totals', [])
        data['company'] = self.env.company.name
        data['currency'] = self.env.company.currency_id.symbol
        data['generated'] = fields.Datetime.to_string(fields.Datetime.now())[:16]
        data['generated_by'] = self.env.user.name
        return data

    def _dt_range(self):
        start = fields.Datetime.to_datetime(self.date_from)
        end = fields.Datetime.to_datetime(self.date_to) + timedelta(days=1)
        return start, end

    def _report_stock_availability(self):
        products = self.env['product.product'].search([('itz_is_stockable', '=', True)], order='itz_category, name')
        cols = [('Product', 'text'), ('Category', 'text'), ('Brand', 'text'), ('On hand', 'float'), ('Reserved', 'float'), ('Available', 'float'),
                ('Alert level', 'float'), ('Status', 'text')]
        rows = []
        cat_label = dict(self.env['product.template']._fields['itz_category'].selection)
        for p in products:
            low = p.itz_min_stock and p.free_qty <= p.itz_min_stock
            rows.append([p.display_name, cat_label.get(p.itz_category, ''), p.itz_brand or '', p.qty_available, p.qty_available - p.free_qty, p.free_qty,
                         p.itz_min_stock or 0.0, 'LOW' if low else 'OK'])
        totals = ['Total', '', '', sum(r[3] for r in rows), sum(r[4] for r in rows), sum(r[5] for r in rows), '', '']
        return {'columns': self._cols(cols), 'rows': rows, 'totals': totals}

    def _report_stock_movement(self):
        start, end = self._dt_range()
        lines = self.env['stock.move.line'].search([('state', '=', 'done'), ('date', '>=', start), ('date', '<', end),
                                                     ('product_id.itz_is_stockable', '=', True)], order='date')
        cols = [('Date', 'datetime'), ('Product', 'text'), ('IMEI / Serial', 'text'), ('Quantity', 'float'), ('From', 'text'), ('To', 'text'),
                ('Transfer', 'text'), ('Done by', 'text')]
        rows = [[l.date, l.product_id.display_name, l.lot_id.name or '', l.quantity, l.location_id.complete_name, l.location_dest_id.complete_name,
                 l.picking_id.name or l.reference or '', l.write_uid.name] for l in lines]
        return {'columns': self._cols(cols), 'rows': rows}

    def _report_installed_devices(self):
        start, end = self._dt_range()
        domain = [('itz_state', '=', 'installed'), ('itz_category', 'in', ('tracker', 'dashcam'))]
        events = self.env['itz.device.event'].search([('event_type', 'in', ('install', 'replace', 'move')), ('date', '>=', start), ('date', '<', end)])
        lots = events.mapped('lot_id').filtered(lambda l: l.itz_state == 'installed' and l.itz_category in ('tracker', 'dashcam'))
        cols = [('IMEI', 'text'), ('Device', 'text'), ('Vehicle', 'text'), ('Customer', 'text'), ('Installed on', 'datetime'), ('Technician', 'text'),
                ('SIM', 'text'), ('Warranty ends', 'date')]
        rows = []
        for lot in lots.sorted('itz_vehicle_plate'):
            ev = events.filtered(lambda e: e.lot_id == lot).sorted('date', reverse=True)[:1]
            rows.append([lot.itz_imei or lot.name, lot.product_id.display_name, lot.itz_vehicle_plate or '', lot.itz_customer_id.name or '', ev.date,
                         ev.user_id.name or '', lot.itz_sim_lot_id.itz_msisdn or lot.itz_sim_lot_id.name or '', lot.itz_warranty_end or ''])
        return {'columns': self._cols(cols), 'rows': rows, 'totals': ['Total', len(rows)] + [''] * 6}

    def _report_sales(self):
        start, end = self._dt_range()
        domain = [('state', '=', 'sale'), ('date_order', '>=', start), ('date_order', '<', end)]
        if self.partner_id:
            domain.append(('partner_id', 'child_of', self.partner_id.id))
        orders = self.env['sale.order'].search(domain, order='date_order')
        cols = [('Order', 'text'), ('Date', 'datetime'), ('Customer', 'text'), ('Salesperson', 'text'), ('Hardware', 'money'), ('Installation', 'money'),
                ('Recurring', 'money'), ('Total (before tax)', 'money'), ('Total', 'money')]
        rows = [[o.name, o.date_order, o.partner_id.name, o.user_id.name or '', o.itz_amount_hardware, o.itz_amount_installation,
                 o.itz_amount_recurring, o.amount_untaxed, o.amount_total] for o in orders]
        totals = ['Total', '', '', ''] + [sum(r[i] for r in rows) for i in range(4, 9)]
        return {'columns': self._cols(cols), 'rows': rows, 'totals': totals}

    def _report_payments(self):
        start, end = self.date_from, self.date_to
        domain = [('payment_type', '=', 'inbound'), ('partner_type', '=', 'customer'), ('state', 'in', ('in_process', 'paid')),
                  ('date', '>=', start), ('date', '<=', end)]
        if self.partner_id:
            domain.append(('partner_id', 'child_of', self.partner_id.id))
        pays = self.env['account.payment'].search(domain, order='date')
        cols = [('Date', 'date'), ('Payment', 'text'), ('Customer', 'text'), ('Invoices', 'text'), ('Method', 'text'), ('Reference', 'text'),
                ('Recorded by', 'text'), ('Amount', 'money')]
        rows = [[p.date, p.name, p.partner_id.name, ', '.join(p.reconciled_invoice_ids.mapped('name')), p.payment_method_line_id.name or '',
                 p.itz_reference or p.memo or '', p.itz_recorded_by_id.name or p.create_uid.name, p.amount] for p in pays]
        return {'columns': self._cols(cols), 'rows': rows, 'totals': ['Total', '', '', '', '', '', '', sum(r[7] for r in rows)]}

    def _invoice_rows(self, invoices):
        today = fields.Date.context_today(self)
        cols = [('Invoice', 'text'), ('Customer', 'text'), ('Invoice date', 'date'), ('Due date', 'date'), ('Days overdue', 'int'),
                ('Total', 'money'), ('Paid', 'money'), ('Balance', 'money'), ('Status', 'text')]
        status = dict(self.env['account.move']._fields['itz_payment_status'].selection)
        rows = [[m.name, m.partner_id.name, m.invoice_date, m.invoice_date_due, m.itz_days_overdue, m.amount_total, m.amount_total - m.amount_residual,
                 m.amount_residual, status.get(m.itz_payment_status, '')] for m in invoices]
        totals = ['Total', '', '', '', '', sum(r[5] for r in rows), sum(r[6] for r in rows), sum(r[7] for r in rows), '']
        return {'columns': self._cols(cols), 'rows': rows, 'totals': totals}

    def _report_outstanding(self):
        domain = [('move_type', '=', 'out_invoice'), ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial'))]
        if self.partner_id:
            domain.append(('commercial_partner_id', '=', self.partner_id.id))
        return self._invoice_rows(self.env['account.move'].search(domain, order='invoice_date_due'))

    def _report_overdue(self):
        domain = [('itz_is_overdue', '=', True)]
        if self.partner_id:
            domain.append(('commercial_partner_id', '=', self.partner_id.id))
        return self._invoice_rows(self.env['account.move'].search(domain, order='invoice_date_due'))

    def _sub_rows(self, subs):
        cols = [('Subscription', 'text'), ('Vehicle', 'text'), ('Customer', 'text'), ('Plan', 'text'), ('Cycle', 'text'), ('Price', 'money'),
                ('Activated', 'date'), ('Renewal date', 'date'), ('Status', 'text'), ('Payment', 'text')]
        state = dict(self.env['itz.subscription']._fields['state'].selection)
        pay = dict(self.env['itz.subscription']._fields['payment_status'].selection)
        cyc = dict(self.env['itz.subscription']._fields['cycle'].selection)
        rows = [[s.name, s.vehicle_id.plate, s.partner_id.name, s.plan_id.display_name, cyc.get(s.cycle, ''), s.price, s.activation_date or '', s.next_renewal_date or '',
                 state.get(s.state, ''), pay.get(s.payment_status, '')] for s in subs]
        return {'columns': self._cols(cols), 'rows': rows, 'totals': ['Total', len(rows), '', '', '', sum(r[5] for r in rows), '', '', '', '']}

    def _report_subscriptions(self):
        domain = [('state', '=', 'active')]
        if self.partner_id:
            domain.append(('partner_id', '=', self.partner_id.id))
        return self._sub_rows(self.env['itz.subscription'].search(domain, order='next_renewal_date'))

    def _report_renewals(self):
        domain = [('state', 'in', ('active', 'suspended', 'expired')), ('next_renewal_date', '>=', self.date_from), ('next_renewal_date', '<=', self.date_to)]
        if self.partner_id:
            domain.append(('partner_id', '=', self.partner_id.id))
        return self._sub_rows(self.env['itz.subscription'].search(domain, order='next_renewal_date'))

    def _tech_report(self, job_types):
        start, end = self._dt_range()
        domain = [('state', '=', 'done'), ('date_done', '>=', start), ('date_done', '<', end), ('job_type', 'in', job_types)]
        if self.technician_id:
            domain.append(('technician_id', '=', self.technician_id.id))
        jobs = self.env['itz.installation'].search(domain, order='technician_id, date_done')
        cols = [('Technician', 'text'), ('Job', 'text'), ('Type', 'text'), ('Completed', 'datetime'), ('Vehicle', 'text'), ('Customer', 'text'), ('Equipment', 'text')]
        types = dict(self.env['itz.installation']._fields['job_type'].selection)
        rows = [[j.technician_id.name, j.name, types.get(j.job_type, ''), j.date_done, j.plate, j.partner_id.name, j._itz_summary()] for j in jobs]
        summary = {}
        for j in jobs:
            summary[j.technician_id.name] = summary.get(j.technician_id.name, 0) + 1
        return {'columns': self._cols(cols), 'rows': rows, 'totals': ['Total jobs', len(rows)] + [''] * 5,
                'summary': [{'label': k, 'value': v} for k, v in sorted(summary.items())]}

    def _report_installations_tech(self):
        return self._tech_report(['install', 'move'])

    def _report_maintenance_tech(self):
        return self._tech_report(['maintenance', 'remove', 'replace'])

    def _report_employee_tasks(self):
        start, end = self._dt_range()
        tasks = self.env['itz.task'].search([('create_date', '>=', start), ('create_date', '<', end)])
        cols = [('Employee', 'text'), ('Department', 'text'), ('Tasks', 'int'), ('Completed', 'int'), ('Open', 'int'), ('Overdue', 'int'),
                ('Completion %', 'float'), ('Average hours to complete', 'float')]
        rows = []
        for emp in sorted(set(tasks.mapped('assigned_user_id')), key=lambda u: u.name):
            mine = tasks.filtered(lambda t: t.assigned_user_id == emp)
            done = mine.filtered(lambda t: t.state == 'completed')
            hrs = [((t.date_done - t.create_date).total_seconds() / 3600.0) for t in done if t.date_done and t.create_date]
            rows.append([emp.name, mine[:1].department_id.name or '', len(mine), len(done), len(mine.filtered(lambda t: t.state in ('pending', 'in_progress'))),
                         len(mine.filtered('is_overdue')), round(100.0 * len(done) / len(mine), 1) if mine else 0.0, round(sum(hrs) / len(hrs), 1) if hrs else 0.0])
        total = ['Total', '', sum(r[2] for r in rows), sum(r[3] for r in rows), sum(r[4] for r in rows), sum(r[5] for r in rows), '', '']
        return {'columns': self._cols(cols), 'rows': rows, 'totals': total}

    @staticmethod
    def _cols(cols):
        return [{'label': label, 'type': kind} for label, kind in cols]

    # --------------------------------------------------------------- outputs
    @api.depends('report_type', 'date_from', 'date_to', 'technician_id', 'partner_id')
    def _compute_preview_html(self):
        for wiz in self:
            try:
                data = wiz.get_report()
                wiz.preview_html = self.env['ir.qweb']._render('itz_dashboard.report_table', {'data': data, 'limit': 200})
            except (AccessError, UserError) as exc:
                wiz.preview_html = '<div class="alert alert-warning">%s</div>' % (exc.args[0] if exc.args else exc)

    def action_print(self):
        self.ensure_one()
        self._check_report_access()
        self.env['itz.audit.log'].log('other', 'Report printed', None, self.report_type)
        return self.env.ref('itz_dashboard.action_report_itz').report_action(self)

    def action_export_xlsx(self):
        self.ensure_one()
        self._check_report_access()
        self.env['itz.audit.log'].log('other', 'Report exported', None, self.report_type)
        params = 'type=%s&df=%s&dt=%s&tech=%s&partner=%s' % (self.report_type, self.date_from or '', self.date_to or '', self.technician_id.id or '', self.partner_id.id or '')
        return {'type': 'ir.actions.act_url', 'url': '/itz/report/xlsx?' + params, 'target': 'self'}

    def to_xlsx(self):
        """Return the report as bytes of an .xlsx file."""
        import xlsxwriter
        self.ensure_one()
        data = self.get_report()
        out = io.BytesIO()
        book = xlsxwriter.Workbook(out, {'in_memory': True, 'default_date_format': 'yyyy-mm-dd'})
        sheet = book.add_worksheet(data['title'][:31])
        title = book.add_format({'bold': True, 'font_size': 14, 'font_color': '#0a1f44'})
        head = book.add_format({'bold': True, 'bg_color': '#0a1f44', 'font_color': '#ffffff', 'border': 1, 'text_wrap': True, 'valign': 'vcenter'})
        money = book.add_format({'num_format': '#,##0.00'})
        dt = book.add_format({'num_format': 'yyyy-mm-dd hh:mm'})
        date = book.add_format({'num_format': 'yyyy-mm-dd'})
        boldm = book.add_format({'bold': True, 'num_format': '#,##0.00', 'top': 1})
        bold = book.add_format({'bold': True, 'top': 1})
        sheet.write(0, 0, 'ITrackZen - %s' % data['title'], title)
        sheet.write(1, 0, '%s  %s' % (data['company'], data['subtitle']))
        sheet.write(2, 0, 'Generated %s by %s' % (data['generated'], data['generated_by']))
        for c, col in enumerate(data['columns']):
            sheet.write(4, c, col['label'], head)
            sheet.set_column(c, c, 18 if col['type'] in ('text',) else 15)
        for r, row in enumerate(data['rows'], start=5):
            for c, value in enumerate(row):
                kind = data['columns'][c]['type']
                if value in (False, None, ''):
                    continue
                if kind == 'datetime' and hasattr(value, 'replace'):
                    sheet.write_datetime(r, c, value.replace(tzinfo=None), dt)
                elif kind == 'date' and hasattr(value, 'year'):
                    sheet.write_datetime(r, c, __import__('datetime').datetime(value.year, value.month, value.day), date)
                elif kind == 'money':
                    sheet.write_number(r, c, float(value), money)
                elif kind in ('int', 'float') and isinstance(value, (int, float)):
                    sheet.write_number(r, c, value)
                else:
                    sheet.write(r, c, str(value))
        if data['totals']:
            r = 5 + len(data['rows'])
            for c, value in enumerate(data['totals']):
                if value in ('', None, False):
                    continue
                if isinstance(value, (int, float)):
                    sheet.write_number(r, c, value, boldm if data['columns'][c]['type'] == 'money' else bold)
                else:
                    sheet.write(r, c, str(value), bold)
        sheet.freeze_panes(5, 0)
        book.close()
        return out.getvalue()
