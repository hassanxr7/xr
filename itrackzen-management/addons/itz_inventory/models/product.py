from odoo import api, fields, models, _

ITZ_CATEGORIES = [
    ('tracker', 'GPS Tracker'),
    ('dashcam', 'Dashcam / Video Telematics'),
    ('fuel_sensor', 'Fuel Sensor'),
    ('relay', 'Relay / Immobilizer'),
    ('rfid', 'RFID / Driver ID'),
    ('sim', 'SIM Card'),
    ('cable', 'Cable / Harness'),
    ('accessory', 'Other Accessory'),
    ('service', 'Installation / Service'),
    ('plan', 'Tracking Plan (recurring)'),
]
SERIALISED = ('tracker', 'dashcam', 'fuel_sensor', 'relay', 'rfid', 'sim')
IMEI_CATEGORIES = ('tracker', 'dashcam')
STOCK_CATEGORIES = SERIALISED + ('cable', 'accessory')


class ProductTemplate(models.Model):
    _name = 'product.template'
    _inherit = ['product.template', 'itz.audit.mixin']

    _itz_audit_fields = ['list_price', 'itz_category', 'itz_min_stock', 'itz_warranty_months', 'active']
    _itz_audit_category = 'stock'

    itz_category = fields.Selection(ITZ_CATEGORIES, string='ITrackZen Category', index=True, tracking=True)
    itz_brand = fields.Char(string='Brand')
    itz_model = fields.Char(string='Model')
    itz_is_device = fields.Boolean(compute='_compute_itz_flags', store=True,
                                   help='Trackers and dashcams: identified by IMEI.')
    itz_is_serialised = fields.Boolean(compute='_compute_itz_flags', store=True)
    itz_is_stockable = fields.Boolean(compute='_compute_itz_flags', store=True)
    itz_fulfilment = fields.Selection(
        [('delivery', 'Normal delivery'), ('installation', 'Issued to technician and installed')],
        string='Fulfilment',
        help='Hardware that a technician installs on a vehicle leaves stock when the installation job is completed, '
             'not when the quotation is confirmed.')
    itz_warranty_months = fields.Integer(string='Warranty (months)', default=0)
    itz_min_stock = fields.Float(string='Low-stock level', help='An alert is raised when available stock is at or below this quantity.')
    itz_available_qty = fields.Float(string='Available to sell', compute='_compute_itz_available', digits='Product Unit of Measure')
    itz_low_stock = fields.Boolean(compute='_compute_itz_available', search='_search_itz_low_stock')

    @api.depends('itz_category')
    def _compute_itz_flags(self):
        for tmpl in self:
            cat = tmpl.itz_category
            tmpl.itz_is_device = cat in IMEI_CATEGORIES
            tmpl.itz_is_serialised = cat in SERIALISED
            tmpl.itz_is_stockable = cat in STOCK_CATEGORIES

    @api.depends('qty_available', 'product_variant_ids.free_qty', 'itz_min_stock', 'itz_is_stockable')
    def _compute_itz_available(self):
        for tmpl in self:
            free = sum(tmpl.product_variant_ids.mapped('free_qty'))
            tmpl.itz_available_qty = free
            tmpl.itz_low_stock = bool(tmpl.itz_is_stockable and tmpl.itz_min_stock and free <= tmpl.itz_min_stock)

    def _search_itz_low_stock(self, operator, value):
        low = self.search([('itz_is_stockable', '=', True), ('itz_min_stock', '>', 0)]).filtered(
            lambda t: t.itz_available_qty <= t.itz_min_stock)
        positive = (operator == '=' and value) or (operator == '!=' and not value)
        return [('id', 'in' if positive else 'not in', low.ids)]

    @api.onchange('itz_category')
    def _onchange_itz_category(self):
        for tmpl in self:
            cat = tmpl.itz_category
            if cat in STOCK_CATEGORIES:
                tmpl.type = 'consu'
                tmpl.is_storable = True
                tmpl.tracking = 'serial' if cat in SERIALISED else 'none'
                tmpl.itz_fulfilment = 'installation' if cat in SERIALISED + ('cable', 'accessory') else 'delivery'
            elif cat in ('service', 'plan'):
                tmpl.type = 'service'
                tmpl.is_storable = False
                tmpl.tracking = 'none'
                tmpl.itz_fulfilment = 'delivery'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            cat = vals.get('itz_category')
            if cat in STOCK_CATEGORIES:
                # Defaults of product.product are merged into vals before this point, so set explicitly.
                vals['type'] = 'consu'
                vals['is_storable'] = True
                if cat in SERIALISED and vals.get('tracking', 'none') == 'none':
                    vals['tracking'] = 'serial'
                vals.setdefault('itz_fulfilment', 'installation')
            elif cat in ('service', 'plan'):
                vals['type'] = 'service'
                vals.setdefault('itz_fulfilment', 'delivery')
        return super().create(vals_list)

    @api.model
    def _itz_cron_low_stock(self):
        """Create one activity per low-stock product for the storekeepers and email a summary."""
        low = self.search([('itz_is_stockable', '=', True), ('itz_min_stock', '>', 0)]).filtered(
            lambda t: t.itz_available_qty <= t.itz_min_stock)
        if not low:
            return True
        group = self.env.ref('itz_base.group_itz_storekeeper')
        users = group.users.filtered(lambda u: u.active)
        activity_type = self.env.ref('mail.mail_activity_data_todo')
        for tmpl in low:
            existing = self.env['mail.activity'].sudo().search_count([
                ('res_model', '=', 'product.template'), ('res_id', '=', tmpl.id),
                ('summary', '=', 'Low stock')])
            if existing:
                continue
            for user in users[:3]:
                tmpl.sudo().activity_schedule(
                    activity_type_id=activity_type.id, summary='Low stock', user_id=user.id,
                    note=_('Available %(qty)s, alert level %(lvl)s. Please reorder.', qty=tmpl.itz_available_qty, lvl=tmpl.itz_min_stock))
        email = self.env.company.itz_low_stock_notify_email
        if email:
            lines = ''.join('<li>%s: %s available (alert level %s)</li>' % (t.display_name, t.itz_available_qty, t.itz_min_stock) for t in low)
            self.env['mail.mail'].sudo().create({
                'subject': _('ITrackZen low-stock alert (%d products)', len(low)),
                'body_html': '<p>The following products are at or below their alert level:</p><ul>%s</ul>' % lines,
                'email_to': email,
            }).send()
        return True


class ProductCostVisibility(models.Model):
    """Purchase cost is visible only to financial users, storekeepers and stock managers."""
    _inherit = 'product.template'

    standard_price = fields.Float(groups='itz_base.group_itz_financial,itz_base.group_itz_storekeeper,stock.group_stock_manager')
