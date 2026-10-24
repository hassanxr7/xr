from odoo import fields
from odoo.addons.itz_inventory.tests.common import ItzCommon


class ItzSalesCommon(ItzCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not cls.company.chart_template:
            cls.env['account.chart.template'].try_loading('generic_coa', company=cls.company, install_demo=False)
        cls.company.itz_approval_required = True
        cls.company.itz_approval_threshold = 500.0
        cls.company.itz_max_discount_pct = 10.0
        cls.install_service = cls.env.ref('itz_sales.product_installation_service').product_variant_id
        cls.install_service.product_tmpl_id.list_price = 25.0
        cls.plan = cls.env['product.product'].create({
            'name': 'Tracking plan monthly', 'itz_category': 'plan', 'list_price': 10.0, 'invoice_policy': 'order',
        })
        cls.customer = cls.env['res.partner'].create({'name': 'Acme Logistics', 'email': 'acme@example.com', 'phone': '+254700111222', 'is_company': True, 'customer_rank': 1})
        cls.vehicle = cls.env['itz.vehicle'].create({'plate': 'KDA 123A', 'partner_id': cls.customer.id})

    def make_quote(self, user=None, qty=1, discount=0.0, with_vehicle=True):
        user = user or self.users['sales']
        vid = self.vehicle.id if with_vehicle else False
        return self.env['sale.order'].with_user(user).create({
            'partner_id': self.customer.id,
            'order_line': [
                (0, 0, {'product_id': self.tracker.id, 'product_uom_qty': qty, 'itz_vehicle_id': vid, 'discount': discount}),
                (0, 0, {'product_id': self.install_service.id, 'product_uom_qty': qty, 'itz_vehicle_id': vid}),
                (0, 0, {'product_id': self.plan.id, 'product_uom_qty': 1, 'itz_vehicle_id': vid}),
            ],
        })
