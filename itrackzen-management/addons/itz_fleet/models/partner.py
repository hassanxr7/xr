from odoo import api, fields, models, _


class ResPartner(models.Model):
    _inherit = 'res.partner'

    itz_vehicle_ids = fields.One2many('itz.vehicle', 'partner_id', string='Vehicles')
    itz_vehicle_count = fields.Integer(compute='_compute_itz_counts')
    itz_installation_ids = fields.One2many('itz.installation', 'partner_id', string='Service history')
    itz_installation_count = fields.Integer(compute='_compute_itz_counts')
    itz_search_plates = fields.Char(string='Vehicle plates', compute='_compute_itz_plates', search='_search_itz_plates')

    @api.depends('itz_vehicle_ids')
    def _compute_itz_counts(self):
        Vehicle = self.env['itz.vehicle'].sudo()
        Install = self.env['itz.installation'].sudo()
        veh = dict(Vehicle._read_group([('partner_id', 'in', self.ids)], ['partner_id'], ['__count']))
        ins = dict(Install._read_group([('partner_id', 'in', self.ids)], ['partner_id'], ['__count']))
        for partner in self:
            partner.itz_vehicle_count = veh.get(partner, 0)
            partner.itz_installation_count = ins.get(partner, 0)

    def _compute_itz_plates(self):
        for partner in self:
            partner.itz_search_plates = ', '.join(partner.itz_vehicle_ids.mapped('plate'))

    def _search_itz_plates(self, operator, value):
        return ['|', ('itz_vehicle_ids.plate', operator, value), ('itz_vehicle_ids.device_ids.itz_imei', operator, value)]

    def action_view_itz_vehicles(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Vehicles'), 'res_model': 'itz.vehicle',
            'view_mode': 'list,form', 'domain': [('partner_id', '=', self.id)],
            'context': {'default_partner_id': self.id},
        }

    def action_view_itz_installations(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Installations'), 'res_model': 'itz.installation',
            'view_mode': 'list,form', 'domain': [('partner_id', '=', self.id)],
            'context': {'default_partner_id': self.id},
        }
