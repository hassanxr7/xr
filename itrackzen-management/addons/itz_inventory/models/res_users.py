from odoo import api, fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    itz_is_technician = fields.Boolean(string='Installation technician', compute='_compute_itz_is_technician', store=True,
                                       help='Set on the employee record (ITrackZen tab).')

    @api.depends('employee_ids.itz_is_technician')
    def _compute_itz_is_technician(self):
        for user in self:
            user.itz_is_technician = any(user.sudo().employee_ids.mapped('itz_is_technician'))
