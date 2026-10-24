from odoo.tests.common import TransactionCase


class ItzCommon(TransactionCase):
    """Shared fixtures: one user per role, a tracker product, a SIM product."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env = cls.env(context=dict(cls.env.context, tracking_disable=True, mail_notrack=True))
        cls.company = cls.env.company
        cls.warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.company.id)], limit=1)
        cls.stock_loc = cls.warehouse.lot_stock_id
        cls.users = {}
        for key, xmlids in {
            'owner': ['itz_base.group_itz_owner'],
            'ops': ['itz_base.group_itz_ops_manager'],
            'sales': ['itz_base.group_itz_sales'],
            'accountant': ['itz_base.group_itz_accountant'],
            'store': ['itz_base.group_itz_storekeeper'],
            'tech': ['itz_base.group_itz_technician'],
            'tech2': ['itz_base.group_itz_technician'],
            'support': ['itz_base.group_itz_support'],
            'readonly': ['itz_base.group_itz_readonly'],
        }.items():
            cls.users[key] = cls._mk_user(key, xmlids)
        for key in ('tech', 'tech2'):
            user = cls.users[key]
            emp = cls.env['hr.employee'].create({'name': 'Tech %s' % key, 'user_id': user.id, 'itz_is_technician': True})
            user.employee_id = emp
        cls.tracker = cls.env['product.product'].create({
            'name': 'GPS Tracker X1', 'itz_category': 'tracker', 'itz_brand': 'Acme', 'itz_model': 'X1',
            'list_price': 90.0, 'standard_price': 55.0, 'itz_min_stock': 2, 'itz_warranty_months': 12,
        })
        cls.sim = cls.env['product.product'].create({'name': 'SIM Card', 'itz_category': 'sim'})
        cls.cable = cls.env['product.product'].create({'name': 'Power cable', 'itz_category': 'cable', 'list_price': 3.0})

    @classmethod
    def _mk_user(cls, key, xmlids):
        groups = [cls.env.ref(x).id for x in xmlids]
        return cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'ITZ %s' % key, 'login': 'itz_%s' % key, 'email': '%s@example.com' % key,
            'groups_id': [(6, 0, [cls.env.ref('base.group_user').id] + groups)],
        })

    def receive(self, product, serials=None, qty=None, user=None):
        """Receive stock through a real supplier receipt."""
        supplier = self.env.ref('stock.stock_location_suppliers')
        partner = self.env['res.partner'].search([('name', '=', 'Test Supplier')], limit=1) or self.env['res.partner'].create({'name': 'Test Supplier'})
        env = self.env(user=user.id) if user else self.env
        picking = env['stock.picking'].create({
            'picking_type_id': self.warehouse.in_type_id.id, 'partner_id': partner.id,
            'location_id': supplier.id, 'location_dest_id': self.stock_loc.id,
        })
        if serials:
            env['stock.move'].create({'name': product.name, 'product_id': product.id, 'product_uom_qty': len(serials),
                                      'product_uom': product.uom_id.id, 'picking_id': picking.id,
                                      'location_id': supplier.id, 'location_dest_id': self.stock_loc.id})
        else:
            env['stock.move'].create({'name': product.name, 'product_id': product.id, 'product_uom_qty': qty,
                                      'product_uom': product.uom_id.id, 'picking_id': picking.id,
                                      'location_id': supplier.id, 'location_dest_id': self.stock_loc.id})
        picking.action_confirm()
        if serials:
            for sn in serials:
                self.env['stock.move.line'].create({
                    'move_id': picking.move_ids.id, 'picking_id': picking.id, 'product_id': product.id,
                    'location_id': supplier.id, 'location_dest_id': self.stock_loc.id,
                    'lot_name': sn, 'quantity': 1, 'picked': True,
                })
        else:
            picking.move_ids.quantity = qty
            picking.move_ids.picked = True
        picking.with_context(skip_backorder=True, skip_immediate=True).button_validate()
        return picking
