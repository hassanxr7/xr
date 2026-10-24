from odoo import api, fields, models, _


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    itz_subscription_ids = fields.One2many('itz.subscription', 'sale_order_id', string='Subscriptions')
    itz_subscription_count = fields.Integer(compute='_compute_itz_subscription_count')

    @api.depends('itz_subscription_ids')
    def _compute_itz_subscription_count(self):
        for order in self:
            order.itz_subscription_count = len(order.itz_subscription_ids)

    def action_confirm(self):
        res = super().action_confirm()
        self.sudo()._itz_create_subscriptions()
        return res

    def _itz_create_subscriptions(self):
        Sub = self.env['itz.subscription']
        for order in self:
            for line in order.order_line.filtered(lambda l: l.product_id.itz_category == 'plan' and not l.display_type):
                if Sub.search_count([('sale_line_id', '=', line.id)]):
                    continue
                if not line.itz_vehicle_id:
                    order.message_post(body=_('Plan "%s" has no vehicle, so no subscription was created. Choose the vehicle on the line and use "Create subscriptions".', line.product_id.display_name))
                    continue
                sub = Sub.create({
                    'partner_id': order.partner_id.commercial_partner_id.id, 'vehicle_id': line.itz_vehicle_id.id,
                    'plan_id': line.product_id.id, 'cycle': line.product_id.itz_plan_cycle or 'monthly',
                    'price': line.price_unit * (1 - (line.discount or 0.0) / 100.0),
                    'initial_cycles': max(int(line.product_uom_qty), 1), 'sale_line_id': line.id, 'currency_id': order.currency_id.id,
                })
                # Vehicle already carries a tracker (plan-only sale or renewal): start right away
                if line.itz_vehicle_id.device_id and not order.itz_installation_ids.filtered(lambda i: i.vehicle_id == line.itz_vehicle_id and i.state != 'cancelled'):
                    sub.action_activate()
        return True

    def action_itz_create_subscriptions(self):
        self.ensure_one()
        self.sudo()._itz_create_subscriptions()
        return self.action_view_itz_subscriptions()

    def action_view_itz_subscriptions(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Subscriptions'), 'res_model': 'itz.subscription',
                'view_mode': 'list,form', 'domain': [('sale_order_id', '=', self.id)]}
