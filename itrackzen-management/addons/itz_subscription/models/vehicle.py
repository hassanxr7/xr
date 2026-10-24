from odoo import api, fields, models, _


class ItzVehicle(models.Model):
    _inherit = 'itz.vehicle'

    subscription_ids = fields.One2many('itz.subscription', 'vehicle_id', string='Subscriptions')
    subscription_count = fields.Integer(compute='_compute_subscription_count')
    active_subscription_id = fields.Many2one('itz.subscription', compute='_compute_subscription_count', string='Current plan')
    subscription_status = fields.Selection(related='active_subscription_id.payment_status', string='Plan payment status')

    @api.depends('subscription_ids.state')
    def _compute_subscription_count(self):
        for veh in self:
            veh.subscription_count = len(veh.subscription_ids)
            live = veh.subscription_ids.filtered(lambda s: s.state in ('active', 'suspended', 'expired')).sorted('next_renewal_date', reverse=True)
            veh.active_subscription_id = live[:1]

    def action_view_subscriptions(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Subscriptions'), 'res_model': 'itz.subscription',
                'view_mode': 'list,form', 'domain': [('vehicle_id', '=', self.id)],
                'context': {'default_vehicle_id': self.id, 'default_partner_id': self.partner_id.id}}
