import hashlib

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

WEB_PLANS = [('starter', 'Starter'), ('business', 'Business'), ('enterprise', 'Enterprise')]
PUBLISH_GROUPS = 'itz_base.group_itz_financial'


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    itz_web_publish = fields.Boolean(
        string='Show on the website', default=False, copy=False, tracking=True, groups=PUBLISH_GROUPS,
        help='Show this product on the public ITrackZen website. Tracking plans show their price. Hardware shows its photo, model and '
             'capabilities with "In stock" or "Out of stock" from the store, and visitors ask for a quotation (no fixed price is published).')
    itz_web_plan = fields.Selection(
        WEB_PLANS, string='Website plan card', copy=False, groups=PUBLISH_GROUPS,
        help='Which plan card on the Pricing page takes its price from this tracking plan.')
    itz_web_features = fields.Text(
        string='What it does (website)', copy=False, groups=PUBLISH_GROUPS,
        help='One capability per line, for example "Live tracking", "SOS button", "Fuel monitoring". Shown as a tick list under the product on the website.')
    itz_web_note = fields.Char(
        string='Website description', copy=False, groups=PUBLISH_GROUPS,
        help='One short line shown under the name on the website. Leave empty to use the sales description.')

    @api.constrains('itz_web_plan', 'itz_category', 'itz_web_publish')
    def _check_itz_web_plan(self):
        for tmpl in self.sudo().filtered('itz_web_plan'):
            if tmpl.itz_category != 'plan':
                raise ValidationError(_('Only tracking plans can be linked to a plan card on the website.'))
            if tmpl.itz_web_publish:
                other = self.sudo().search([('id', '!=', tmpl.id), ('itz_web_publish', '=', True), ('itz_web_plan', '=', tmpl.itz_web_plan),
                                            ('itz_plan_cycle', '=', tmpl.itz_plan_cycle)], limit=1)
                if other:
                    raise ValidationError(_('"%(other)s" is already shown on the %(plan)s card for this billing cycle.',
                                            other=other.name, plan=dict(WEB_PLANS)[tmpl.itz_web_plan]))

    def _itz_catalog_row(self):
        """What the public website may know about a product: name, price, description and whether it is in stock. Never costs."""
        self.ensure_one()
        in_stock = None
        if self.itz_is_stockable:
            in_stock = self.itz_available_qty > 0
        row = {
            'id': self.id, 'name': self.name, 'category': self.itz_category,
            'category_label': dict(self._fields['itz_category'].selection).get(self.itz_category),
            'brand': self.itz_brand or '', 'model': self.itz_model or '',
            'blurb': self.itz_web_note or (self.description_sale or '').strip().split('\n')[0][:160], 'in_stock': in_stock,
            'features': [line.strip() for line in (self.itz_web_features or '').splitlines() if line.strip()][:12],
            'image': hashlib.sha1(('%s|%s' % (self.id, self.write_date if self.image_1920 else '')).encode()).hexdigest()[:12] if self.image_1920 else '',
        }
        if self.itz_category == 'plan':
            # Only subscription plans carry a price on the website. Hardware and services are quoted.
            row.update({'price': self.list_price, 'plan': self.itz_web_plan or '', 'cycle': self.itz_plan_cycle, 'months': self.itz_plan_months,
                        'cycle_label': dict(self._fields['itz_plan_cycle'].selection).get(self.itz_plan_cycle)})
        return row

    @api.model
    def itz_website_catalog(self):
        """Published products for the website: plans with a price; hardware with image, model and capabilities but no price."""
        products = self.sudo().search([('itz_web_publish', '=', True), ('sale_ok', '=', True), ('active', '=', True)], order='itz_category, name')
        products = products.filtered(lambda p: p.itz_category != 'plan' or p.list_price > 0)
        company = self.env.company
        cur = company.currency_id
        plans = [p._itz_catalog_row() for p in products if p.itz_category == 'plan']
        items = [p._itz_catalog_row() for p in products if p.itz_category != 'plan']
        return {'currency': {'code': cur.name, 'symbol': cur.symbol, 'position': cur.position, 'decimals': cur.decimal_places},
                'plans': plans, 'items': items, 'company': company.name}
