"""Staging demo data. Everything here is invented sample data (names, phone numbers, prices, IMEIs).
It goes through the real business methods, so the demo shows the same behaviour as production."""
import logging
from datetime import timedelta

from odoo import api, fields, models

_logger = logging.getLogger(__name__)
DEMO_PASSWORD = 'ITZ-demo-2026!'

STAFF = [
    # key, name, login, role xmlids, department, job
    ('owner', 'Amina Owner', 'owner@demo.itrackzen.net', ['itz_base.group_itz_owner'], 'dept_management', 'job_owner'),
    ('ops', 'Omar Operations', 'ops@demo.itrackzen.net', ['itz_base.group_itz_ops_manager'], 'dept_operations', 'job_ops_manager'),
    ('sales', 'Sara Sales', 'sales@demo.itrackzen.net', ['itz_base.group_itz_sales'], 'dept_sales', 'job_sales_officer'),
    ('accountant', 'Ali Accounts', 'accounts@demo.itrackzen.net', ['itz_base.group_itz_accountant'], 'dept_finance', 'job_accountant'),
    ('store', 'Sahra Store', 'store@demo.itrackzen.net', ['itz_base.group_itz_storekeeper'], 'dept_store', 'job_storekeeper'),
    ('tech1', 'Tariq Technician', 'tech1@demo.itrackzen.net', ['itz_base.group_itz_technician'], 'dept_installation', 'job_technician'),
    ('tech2', 'Tina Technician', 'tech2@demo.itrackzen.net', ['itz_base.group_itz_technician'], 'dept_installation', 'job_technician'),
    ('support', 'Samir Support', 'support@demo.itrackzen.net', ['itz_base.group_itz_support'], 'dept_support', 'job_support_agent'),
    ('viewer', 'Rana Reader', 'viewer@demo.itrackzen.net', ['itz_base.group_itz_readonly'], 'dept_management', 'job_owner'),
]


class ItzDemoLoader(models.AbstractModel):
    _name = 'itz.demo.loader'
    _description = 'ITrackZen staging demo data loader'

    @api.model
    def load(self):
        env = self.with_context(tracking_disable=True, mail_notrack=True, mail_create_nolog=True, no_reset_password=True).env
        if env['res.users'].search_count([('login', '=', STAFF[0][2])]):
            return True
        _logger.info('Loading ITrackZen demo data')
        company = env.company
        # chart of accounts for invoicing (generic) if none yet
        if not company.chart_template:
            env['account.chart.template'].try_loading('generic_coa', company=company, install_demo=False)
        company.write({
            'itz_approval_required': True, 'itz_approval_threshold': 500.0, 'itz_max_discount_pct': 10.0,
            'itz_payment_instructions': '<p>Bank transfer or mobile money. Use the invoice number as the payment reference.<br/>DEMO ACCOUNT 000-000-000 &#183; DEMO MOBILE MONEY 0700 000 000</p>',
            'itz_terms_note': 'Demo data for staging. Prices shown are samples only. Hardware warranty applies from the installation date.',
        })
        users = self._users(env)
        products = self._products(env)
        self._stock(env, products, users)
        customers = self._customers(env)
        self._sales_flow(env, products, users, customers)
        self._tasks_and_enquiries(env, users, customers)
        self._finish(env, users)
        return True

    # ------------------------------------------------------------------ users
    def _users(self, env):
        users = {}
        for key, name, login, roles, dept, job in STAFF:
            groups = [env.ref('base.group_user').id] + [env.ref(r).id for r in roles]
            user = env['res.users'].with_context(no_reset_password=True).create({
                'name': name, 'login': login, 'email': login, 'password': DEMO_PASSWORD, 'groups_id': [(6, 0, groups)],
            })
            emp = env['hr.employee'].create({
                'name': name, 'user_id': user.id, 'department_id': env.ref('itz_tasks.%s' % dept).id, 'job_id': env.ref('itz_tasks.%s' % job).id,
                'work_email': login, 'itz_is_technician': key.startswith('tech'),
                'itz_responsibilities': {
                    'tech1': 'Installations and maintenance, Nairobi region', 'tech2': 'Installations and maintenance, coastal region',
                    'store': 'Receives hardware, issues equipment to technicians, stock counts', 'sales': 'Quotations, customer follow-up',
                    'accountant': 'Invoices, payments, statements, collections', 'ops': 'Approvals, scheduling, team performance',
                }.get(key, ''),
            })
            users[key] = user
        cfg = env['itz.website.config'].get_config()
        cfg.sudo().write({'default_sales_user_id': users['sales'].id, 'default_support_user_id': users['support'].id})
        return users

    # --------------------------------------------------------------- products
    def _products(self, env):
        P = env['product.product']
        warranty = 12
        p = {}
        p['tracker'] = P.create({'name': 'Demo GPS Tracker (basic)', 'itz_category': 'tracker', 'itz_brand': 'Demo', 'itz_model': 'T-100',
                                 'list_price': 85.0, 'standard_price': 52.0, 'itz_min_stock': 3, 'itz_warranty_months': warranty, 'default_code': 'DEMO-T100'})
        p['tracker_pro'] = P.create({'name': 'Demo GPS Tracker (fuel and CAN ready)', 'itz_category': 'tracker', 'itz_brand': 'Demo', 'itz_model': 'T-300',
                                     'list_price': 140.0, 'standard_price': 91.0, 'itz_min_stock': 2, 'itz_warranty_months': warranty, 'default_code': 'DEMO-T300'})
        p['dashcam'] = P.create({'name': 'Demo AI Dashcam', 'itz_category': 'dashcam', 'itz_brand': 'Demo', 'itz_model': 'D-200',
                                 'list_price': 230.0, 'standard_price': 150.0, 'itz_min_stock': 1, 'itz_warranty_months': warranty, 'default_code': 'DEMO-D200'})
        p['fuel'] = P.create({'name': 'Demo Fuel Level Sensor', 'itz_category': 'fuel_sensor', 'itz_brand': 'Demo', 'itz_model': 'F-10',
                              'list_price': 95.0, 'standard_price': 60.0, 'itz_min_stock': 2, 'default_code': 'DEMO-F10'})
        p['relay'] = P.create({'name': 'Demo Relay', 'itz_category': 'relay', 'list_price': 12.0, 'standard_price': 6.0, 'default_code': 'DEMO-R1'})
        p['rfid'] = P.create({'name': 'Demo RFID Driver Tag', 'itz_category': 'rfid', 'list_price': 6.0, 'standard_price': 2.5, 'default_code': 'DEMO-RF1'})
        p['sim'] = P.create({'name': 'Demo SIM Card', 'itz_category': 'sim', 'list_price': 3.0, 'standard_price': 1.0, 'itz_min_stock': 5, 'default_code': 'DEMO-SIM'})
        p['cable'] = P.create({'name': 'Demo Power Cable Kit', 'itz_category': 'cable', 'list_price': 4.0, 'standard_price': 1.5, 'itz_min_stock': 10, 'default_code': 'DEMO-CAB'})
        p['install'] = env.ref('itz_sales.product_installation_service').product_variant_id
        p['install'].product_tmpl_id.list_price = 25.0
        p['removal'] = env.ref('itz_sales.product_removal_service').product_variant_id
        p['removal'].product_tmpl_id.list_price = 15.0
        p['plan_m'] = P.create({'name': 'Demo Tracking Plan - Monthly', 'itz_category': 'plan', 'list_price': 8.0, 'itz_plan_cycle': 'monthly', 'default_code': 'DEMO-PLAN-M'})
        p['plan_q'] = P.create({'name': 'Demo Tracking Plan - Quarterly', 'itz_category': 'plan', 'list_price': 22.0, 'itz_plan_cycle': 'quarterly', 'default_code': 'DEMO-PLAN-Q'})
        p['plan_y'] = P.create({'name': 'Demo Tracking Plan - Yearly', 'itz_category': 'plan', 'list_price': 80.0, 'itz_plan_cycle': 'annual', 'default_code': 'DEMO-PLAN-Y'})
        return p

    # ------------------------------------------------------------------ stock
    def _receive(self, env, product, serials=None, qty=None, partner=None, extra_vals=None):
        supplier_loc = env.ref('stock.stock_location_suppliers')
        wh = env['stock.warehouse'].search([('company_id', '=', env.company.id)], limit=1)
        picking = env['stock.picking'].create({'picking_type_id': wh.in_type_id.id, 'partner_id': partner.id,
                                               'location_id': supplier_loc.id, 'location_dest_id': wh.lot_stock_id.id})
        env['stock.move'].create({'name': product.name, 'product_id': product.id, 'product_uom_qty': len(serials) if serials else qty,
                                  'product_uom': product.uom_id.id, 'picking_id': picking.id,
                                  'location_id': supplier_loc.id, 'location_dest_id': wh.lot_stock_id.id})
        picking.action_confirm()
        if serials:
            for sn in serials:
                env['stock.move.line'].create({'move_id': picking.move_ids.id, 'picking_id': picking.id, 'product_id': product.id,
                                               'location_id': supplier_loc.id, 'location_dest_id': wh.lot_stock_id.id,
                                               'lot_name': sn, 'quantity': 1, 'picked': True})
        else:
            picking.move_ids.quantity = qty
            picking.move_ids.picked = True
        picking.with_context(skip_backorder=True, skip_immediate=True).button_validate()
        return picking

    def _stock(self, env, p, users):
        supplier = env['res.partner'].create({'name': 'Demo Hardware Supplier Ltd', 'is_company': True, 'supplier_rank': 1, 'email': 'orders@supplier.example',
                                              'phone': '+86 755 0000 0000', 'country_id': env.ref('base.cn').id})
        def imeis(prefix, n):
            out = []
            for i in range(n):
                base = '%s%06d' % (prefix, i + 1)       # 8-digit type code + 6-digit serial + Luhn check digit = 15 digits
                out.append(base + str(self._luhn_digit(base)))
            return out
        self._receive(env, p['tracker'], imeis('35630704', 12), partner=supplier)
        self._receive(env, p['tracker_pro'], imeis('35630705', 6), partner=supplier)
        self._receive(env, p['dashcam'], imeis('86043210', 4), partner=supplier)
        self._receive(env, p['fuel'], ['FS-DEMO-%04d' % i for i in range(1, 6)], partner=supplier)
        self._receive(env, p['relay'], ['RL-DEMO-%04d' % i for i in range(1, 9)], partner=supplier)
        self._receive(env, p['rfid'], ['RF-DEMO-%04d' % i for i in range(1, 11)], partner=supplier)
        sims = ['89254010000000%05d' % i for i in range(1, 21)]
        self._receive(env, p['sim'], sims, partner=supplier)
        self._receive(env, p['cable'], qty=60, partner=supplier)
        for i, lot in enumerate(env['stock.lot'].search([('product_id', '=', p['sim'].id)], order='name')):
            lot.write({'itz_msisdn': '+25471100%04d' % (i + 1), 'itz_carrier': 'Demo Mobile', 'itz_apn': 'internet'})
        # Issue some equipment to the technicians
        tech1, tech2 = users['tech1'], users['tech2']
        for tech, n in ((tech1, 4), (tech2, 3)):
            lots = env['stock.lot'].search([('product_id', '=', p['tracker'].id), ('itz_state', '=', 'available')], order='name', limit=n)
            sim_lots = env['stock.lot'].search([('product_id', '=', p['sim'].id), ('itz_state', '=', 'available')], order='name', limit=n)
            lines = [(0, 0, {'product_id': l.product_id.id, 'lot_id': l.id, 'quantity': 1}) for l in lots | sim_lots]
            lines.append((0, 0, {'product_id': p['cable'].id, 'quantity': 6}))
            env['itz.issue.technician'].with_user(users['store']).create({'technician_id': tech.id, 'line_ids': lines}).action_confirm()

    @staticmethod
    def _luhn_digit(base):
        total = 0
        for i, ch in enumerate(reversed(base)):
            d = int(ch)
            if i % 2 == 0:
                d *= 2
                d = d - 9 if d > 9 else d
            total += d
        return (10 - total % 10) % 10

    # -------------------------------------------------------------- customers
    def _customers(self, env):
        defs = [
            ('Nairobi Haulage Ltd', 'ops@nairobihaulage.example', '+254 700 100 200', 'ke', [('KDA 123A', 'Isuzu', 'FRR', 'truck'), ('KDB 456B', 'Isuzu', 'NPR', 'truck'), ('KDC 789C', 'Toyota', 'Hilux', 'suv')]),
            ('Mombasa Coach Services', 'fleet@mombasacoach.example', '+254 711 200 300', 'ke', [('KCZ 321D', 'Scania', 'K360', 'bus'), ('KCZ 654E', 'Scania', 'K360', 'bus')]),
            ('Kampala Fresh Foods', 'transport@kampalafresh.example', '+256 700 300 400', 'ug', [('UBA 111X', 'Mitsubishi', 'Canter', 'truck'), ('UBA 222Y', 'Mitsubishi', 'Canter', 'truck')]),
            ('Hargeisa Logistics', 'info@hargeisalogistics.example', '+252 63 400 5000', 'so', [('HRG 4001', 'Hino', '500', 'truck')]),
            ('Juba Water Supply', 'admin@jubawater.example', '+211 920 500 600', 'ss', [('SSD 77 A', 'Toyota', 'Land Cruiser', 'suv')]),
            ('Addis Courier', 'hello@addiscourier.example', '+251 91 600 7000', 'et', [('AA 3-12345', 'Bajaj', 'Boxer', 'motorcycle')]),
        ]
        out = {}
        for name, email, phone, cc, vehicles in defs:
            partner = env['res.partner'].create({'name': name, 'is_company': True, 'email': email, 'phone': phone, 'customer_rank': 1,
                                                 'country_id': env.ref('base.%s' % cc).id})
            env['res.partner'].create({'name': 'Contact at ' + name, 'parent_id': partner.id, 'type': 'contact', 'email': email, 'phone': phone})
            vs = []
            for plate, make, model, vtype in vehicles:
                vs.append(env['itz.vehicle'].create({'plate': plate, 'partner_id': partner.id, 'make': make, 'model': model, 'vehicle_type': vtype}))
            out[name] = (partner, vs)
        return out

    # ------------------------------------------------------------- sales flow
    def _sales_flow(self, env, p, users, customers):
        sales, ops, acc, store = users['sales'], users['ops'], users['accountant'], users['store']
        today = fields.Date.context_today(env['res.users'])

        def quote(partner, vehicles_lines, user=sales, **kw):
            lines = []
            for prod, vehicle, price, disc in vehicles_lines:
                lines.append((0, 0, {'product_id': prod.id, 'product_uom_qty': 1, 'itz_vehicle_id': vehicle.id if vehicle else False,
                                     'price_unit': price if price is not None else prod.lst_price, 'discount': disc or 0.0}))
            return env['sale.order'].with_user(user).create({'partner_id': partner.id, 'order_line': lines, **kw})

        # 1) Nairobi Haulage: three vehicles, approved, confirmed, installed, invoiced, part-paid
        nh, nh_v = customers['Nairobi Haulage Ltd']
        o1 = quote(nh, [(p['tracker'], v, None, 0) for v in nh_v] + [(p['install'], v, None, 0) for v in nh_v] + [(p['plan_m'], v, None, 0) for v in nh_v])
        o1.action_itz_request_approval()
        o1.with_user(ops).action_itz_approve()
        o1.with_user(sales).action_confirm()
        self._install_order(env, o1, users, p, techs=['tech1'], days_ago=20, issue=False)
        inv = o1.with_user(acc)._create_invoices()
        inv.with_user(acc).action_post()
        self._pay(env, inv, acc, amount=150.0, ref='MPESA-DEMO-001')

        # 2) Mombasa Coach: dashcam + tracker, installed and fully paid, yearly plans
        mc, mc_v = customers['Mombasa Coach Services']
        o2 = quote(mc, [(p['tracker_pro'], v, None, 5) for v in mc_v] + [(p['dashcam'], mc_v[0], None, 0)] + [(p['install'], v, None, 0) for v in mc_v] + [(p['plan_y'], v, None, 0) for v in mc_v])
        o2.action_itz_request_approval()
        o2.with_user(ops).action_itz_approve()
        o2.with_user(sales).action_confirm()
        self._install_order(env, o2, users, p, techs=['tech2'], days_ago=45, issue=True)
        inv2 = o2.with_user(acc)._create_invoices()
        inv2.invoice_date = today - timedelta(days=45)
        inv2.invoice_date_due = today - timedelta(days=30)
        inv2.with_user(acc).action_post()
        self._pay(env, inv2, acc, ref='BANK-DEMO-7781')

        # 3) Kampala Fresh Foods: invoice issued, overdue and unpaid, installed 70 days ago, quarterly plans due for renewal
        kf, kf_v = customers['Kampala Fresh Foods']
        o3 = quote(kf, [(p['tracker'], v, None, 0) for v in kf_v] + [(p['install'], v, None, 0) for v in kf_v] + [(p['plan_q'], v, None, 0) for v in kf_v])
        o3.action_itz_request_approval()
        o3.with_user(ops).action_itz_approve()
        o3.with_user(sales).action_confirm()
        self._install_order(env, o3, users, p, techs=['tech1'], days_ago=70, issue=True)
        inv3 = o3.with_user(acc)._create_invoices()
        inv3.invoice_date = today - timedelta(days=70)
        inv3.invoice_date_due = today - timedelta(days=55)
        inv3.with_user(acc).action_post()
        # renewals fall due soon
        for sub in env['itz.subscription'].search([('partner_id', '=', kf.id)]):
            sub.sudo().next_renewal_date = today + timedelta(days=9)

        # 4) Hargeisa: waiting for approval (large discount)
        hl, hl_v = customers['Hargeisa Logistics']
        o4 = quote(hl, [(p['tracker_pro'], hl_v[0], None, 15), (p['fuel'], hl_v[0], None, 0), (p['install'], hl_v[0], None, 0), (p['plan_m'], hl_v[0], None, 0)])
        o4.action_itz_request_approval()

        # 5) Juba: confirmed, installation scheduled for tomorrow with equipment issued
        jw, jw_v = customers['Juba Water Supply']
        o5 = quote(jw, [(p['tracker'], jw_v[0], None, 0), (p['install'], jw_v[0], None, 0), (p['plan_m'], jw_v[0], None, 0)])
        o5.with_user(sales).action_confirm()
        job = o5.itz_installation_ids
        lot = env['stock.lot'].search([('product_id', '=', p['tracker'].id), ('itz_state', '=', 'issued'), ('itz_technician_user_id', '=', users['tech2'].id)], limit=1)
        sim = env['stock.lot'].search([('product_id', '=', p['sim'].id), ('itz_state', '=', 'issued'), ('itz_technician_user_id', '=', users['tech2'].id)], limit=1)
        job.with_user(ops).write({'technician_id': users['tech2'].id, 'date_planned': fields.Datetime.now() + timedelta(days=1, hours=2),
                                  'location_address': 'Juba, Gudele road depot'})
        job.line_ids[0].write({'lot_id': lot.id, 'sim_lot_id': sim.id})
        job.with_user(ops).action_schedule()

        # 6) Addis Courier: draft quotation
        ac, ac_v = customers['Addis Courier']
        quote(ac, [(p['tracker'], ac_v[0], None, 0), (p['install'], ac_v[0], None, 0), (p['plan_m'], ac_v[0], None, 0)])
        # A removal / maintenance example for Nairobi Haulage
        job2 = env['itz.installation'].with_user(ops).create({
            'job_type': 'maintenance', 'partner_id': nh.id, 'vehicle_id': nh_v[1].id, 'technician_id': users['tech1'].id,
            'date_planned': fields.Datetime.now() + timedelta(hours=5), 'location_address': 'Industrial Area depot', 'notes': 'Customer reports tracker offline since Monday.'})
        job2.write({'line_ids': [(0, 0, {'action': 'remove', 'product_id': p['tracker'].id, 'lot_id': nh_v[1].device_id.id})]}) if nh_v[1].device_id else None
        if job2.line_ids:
            job2.action_schedule()

    def _install_order(self, env, order, users, p, techs, days_ago, issue):
        """Assign technicians, issue equipment when needed and complete every installation job of the order."""
        ops, store = users['ops'], users['store']
        tech = users[techs[0]]
        past = fields.Datetime.now() - timedelta(days=days_ago)
        used_sims = env['stock.lot'].browse()
        for job in order.itz_installation_ids:
            job.with_user(ops).write({'technician_id': tech.id, 'date_planned': past, 'customer_confirmed_by': 'Driver on site',
                                      'location_address': 'Customer depot'})
            for line in job.line_ids.filtered(lambda l: l.action == 'install'):
                if line.product_id.tracking == 'none':
                    continue
                taken = job.line_ids.lot_id
                free = env['stock.lot'].search([('product_id', '=', line.product_id.id), ('itz_state', 'in', ('issued', 'available')),
                                                ('itz_technician_user_id', 'in', (tech.id, False)), ('itz_vehicle_id', '=', False),
                                                ('id', 'not in', taken.ids)], order='itz_state desc, name', limit=1)
                line.write({'lot_id': free.id})
                if line.product_id.itz_category in ('tracker', 'dashcam'):
                    sim = env['stock.lot'].search([('product_id', '=', p['sim'].id), ('itz_state', 'in', ('issued', 'available')),
                                                   ('itz_technician_user_id', 'in', (tech.id, False)), ('itz_vehicle_id', '=', False),
                                                   ('itz_device_lot_id', '=', False), ('id', 'not in', (used_sims | job.line_ids.sim_lot_id).ids)],
                                                  order='itz_state desc, name', limit=1)
                    line.write({'sim_lot_id': sim.id})
                    used_sims |= sim
            to_issue = []
            for line in job.line_ids.filtered(lambda l: l.action == 'install'):
                if line.lot_id and line.lot_id.itz_state == 'available':
                    to_issue.append((0, 0, {'product_id': line.product_id.id, 'lot_id': line.lot_id.id, 'quantity': 1}))
                if line.sim_lot_id and line.sim_lot_id.itz_state == 'available':
                    to_issue.append((0, 0, {'product_id': line.sim_lot_id.product_id.id, 'lot_id': line.sim_lot_id.id, 'quantity': 1}))
            if to_issue:
                env['itz.issue.technician'].with_user(store).create({'technician_id': tech.id, 'line_ids': to_issue}).action_confirm()
            job.with_user(ops).action_schedule()
            job.with_user(tech).action_start()
            job.with_user(tech).action_done()
            job.sudo().write({'date_done': past})
        # backdate the subscriptions so renewals look realistic
        for sub in order.itz_subscription_ids:
            if sub.state == 'active' and days_ago:
                start = fields.Date.context_today(env['res.users']) - timedelta(days=days_ago)
                sub.sudo().write({'activation_date': start, 'next_renewal_date': sub._add_cycles(start, sub.initial_cycles)})
                sub.sudo().period_ids.write({'period_start': start, 'period_end': sub.next_renewal_date})

    def _pay(self, env, invoice, user, amount=None, ref=''):
        reg = env['account.payment.register'].with_user(user).with_context(active_model='account.move', active_ids=invoice.ids).create(
            {'amount': amount} if amount else {})
        pay = reg.action_create_payments()
        env['account.payment'].search([('reconciled_invoice_ids', 'in', invoice.ids)]).sudo().write({'itz_reference': ref})

    # --------------------------------------------------------- tasks, enquiries
    def _tasks_and_enquiries(self, env, users, customers):
        Task = env['itz.task']
        nh, nh_v = customers['Nairobi Haulage Ltd']
        kf, _kv = customers['Kampala Fresh Foods']
        now = fields.Datetime.now()
        Task.with_user(users['ops']).create({'name': 'Call Kampala Fresh Foods about overdue invoice', 'task_type': 'payment_collection', 'partner_id': kf.id,
                                             'assigned_user_id': users['accountant'].id, 'priority': '3', 'date_deadline': now - timedelta(days=1)})
        Task.with_user(users['sales']).create({'name': 'Follow up Hargeisa Logistics quotation', 'task_type': 'sales_followup', 'assigned_user_id': users['sales'].id,
                                               'date_deadline': now + timedelta(days=2), 'priority': '2'})
        Task.with_user(users['ops']).create({'name': 'Customer cannot see vehicle KDB 456B on the map', 'task_type': 'support', 'partner_id': nh.id,
                                             'vehicle_id': nh_v[1].id, 'assigned_user_id': users['support'].id, 'date_deadline': now + timedelta(hours=6), 'priority': '2'})
        Task.with_user(users['ops']).create({'name': 'Stock count: trackers and SIM cards', 'task_type': 'stock', 'assigned_user_id': users['store'].id,
                                             'date_deadline': now + timedelta(days=5)})
        done = Task.with_user(users['ops']).create({'name': 'Send welcome pack to Mombasa Coach', 'task_type': 'sales_followup', 'assigned_user_id': users['sales'].id})
        done.with_user(users['sales']).action_done()
        env['itz.website.event'].ingest({'id': 'demo-enq-1', 'type': 'enquiry.created', 'data': {
            'ref': 'QTE-DEMO-0001', 'type': 'quote', 'full_name': 'Hassan Warsame', 'company': 'Warsame Transport', 'country': 'Somalia', 'phone': '+252 61 000 0000',
            'email': 'hassan@warsame.example', 'vehicles': '18', 'service': 'GPS Tracking', 'message': 'We need trackers and fuel monitoring for 18 trucks.',
            'extra': {'hardware': 'I need trackers and installation', 'plan': 'Standard'}}})
        env['itz.website.event'].ingest({'id': 'demo-enq-2', 'type': 'enquiry.created', 'data': {
            'ref': 'DEM-DEMO-0002', 'type': 'demo', 'full_name': 'Grace Achieng', 'company': 'Lake Region Buses', 'country': 'Kenya', 'phone': '+254 700 000 000',
            'email': 'grace@lakeregion.example', 'vehicles': '40', 'service': 'Fleet Management', 'message': 'Please arrange a demo this week.'}})
        env['itz.website.event'].ingest({'id': 'demo-del-1', 'type': 'deletion.created', 'data': {'ref': 'DEL-DEMO-0001', 'status': 'awaiting_review'}})

    def _finish(self, env, users):
        # Run the daily automatic jobs once so the demo shows reminders and collection tasks
        env['itz.task']._cron_collection_tasks()
        env['itz.subscription']._cron_reminders()
        env['product.template']._itz_cron_low_stock()
        icp = env['ir.config_parameter'].sudo()
        icp.set_param('itz.demo', '1')
