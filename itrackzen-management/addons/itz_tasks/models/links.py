from odoo import api, fields, models, _


class ResPartner(models.Model):
    _inherit = 'res.partner'

    itz_task_ids = fields.One2many('itz.task', 'partner_id', string='Tasks')
    itz_task_count = fields.Integer(compute='_compute_itz_task_count')

    @api.depends('itz_task_ids')
    def _compute_itz_task_count(self):
        data = dict(self.env['itz.task'].sudo()._read_group([('partner_id', 'in', self.ids), ('state', 'in', ('pending', 'in_progress'))], ['partner_id'], ['__count']))
        for partner in self:
            partner.itz_task_count = data.get(partner, 0)

    def action_view_itz_tasks(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Tasks'), 'res_model': 'itz.task', 'view_mode': 'list,form,kanban',
                'domain': [('partner_id', '=', self.id)], 'context': {'default_partner_id': self.id}}


class ItzVehicle(models.Model):
    _inherit = 'itz.vehicle'

    itz_task_ids = fields.One2many('itz.task', 'vehicle_id', string='Tasks')
    itz_task_count = fields.Integer(compute='_compute_itz_task_count')

    @api.depends('itz_task_ids')
    def _compute_itz_task_count(self):
        data = dict(self.env['itz.task'].sudo()._read_group([('vehicle_id', 'in', self.ids), ('state', 'in', ('pending', 'in_progress'))], ['vehicle_id'], ['__count']))
        for veh in self:
            veh.itz_task_count = data.get(veh, 0)

    def action_view_itz_tasks(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Tasks'), 'res_model': 'itz.task', 'view_mode': 'list,form,kanban',
                'domain': [('vehicle_id', '=', self.id)], 'context': {'default_vehicle_id': self.id, 'default_partner_id': self.partner_id.id}}
