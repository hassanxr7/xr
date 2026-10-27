from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

WEB_PLANS = [('starter', 'Starter'), ('business', 'Business'), ('enterprise', 'Enterprise')]
PUBLISH_GROUPS = 'itz_base.group_itz_financial'


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    itz_web_publish = fields.Boolean(
        string='Show on the website', default=False, copy=False, tracking=True, groups=PUBLISH_GROUPS,
        help='Show this product and its price on the public ITrackZen website (Pricing page and home page). '
             'Only products with a price above zero are shown. Hardware shows "In stock" or "Out of stock" from the store.')
    itz_web_plan = fields.Selection(
        WEB_PLANS, string='Website plan card', copy=False, groups=PUBLISH_GROUPS,
        help='Which plan card on the Pricing page takes its price from this tracking plan.')
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
            'name': self.name, 'category': self.itz_category, 'category_label': dict(self._fields['itz_category'].selection).get(self.itz_category),
            'brand': self.itz_brand or '', 'model': self.itz_model or '', 'price': self.list_price,
            'blurb': self.itz_web_note or (self.description_sale or '').strip().split('\n')[0][:160], 'in_stock': in_stock,
        }
        if self.itz_category == 'plan':
            row.update({'plan': self.itz_web_plan or '', 'cycle': self.itz_plan_cycle, 'months': self.itz_plan_months,
                        'cycle_label': dict(self._fields['itz_plan_cycle'].selection).get(self.itz_plan_cycle)})
        return row

    @api.model
    def itz_website_catalog(self):
        """Published products with a price, for the website. Run as superuser by the signed endpoint."""
        products = self.sudo().search([('itz_web_publish', '=', True), ('sale_ok', '=', True), ('active', '=', True), ('list_price', '>', 0)],
                                      order='itz_category, list_price, name')
        company = self.env.company
        cur = company.currency_id
        plans = [p._itz_catalog_row() for p in products if p.itz_category == 'plan']
        items = [p._itz_catalog_row() for p in products if p.itz_category != 'plan']
        return {'currency': {'code': cur.name, 'symbol': cur.symbol, 'position': cur.position, 'decimals': cur.decimal_places},
                'plans': plans, 'items': items, 'company': company.name}
