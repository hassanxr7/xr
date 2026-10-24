from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    itz_is_technician = fields.Boolean(string='Installation technician', groups='hr.group_hr_user')
    itz_responsibilities = fields.Text(string='Responsibilities', groups='hr.group_hr_user')
    itz_stock_location_id = fields.Many2one('stock.location', string='Technician stock location', copy=False, readonly=True, groups='hr.group_hr_user')
    itz_issued_count = fields.Integer(string='Devices in hand', compute='_compute_itz_issued_count', groups='hr.group_hr_user')

    def _compute_itz_issued_count(self):
        for emp in self:
            emp.itz_issued_count = self.env['stock.lot'].sudo().search_count(
                [('itz_technician_user_id', '=', emp.user_id.id)]) if emp.user_id else 0

    @api.model_create_multi
    def create(self, vals_list):
        emps = super().create(vals_list)
        emps.filtered('itz_is_technician')._itz_ensure_location()
        return emps

    def write(self, vals):
        res = super().write(vals)
        if vals.get('itz_is_technician') or 'user_id' in vals or 'name' in vals:
            self.filtered('itz_is_technician')._itz_ensure_location()
        return res

    def _itz_ensure_location(self):
        Location = self.env['stock.location'].sudo()
        for emp in self:
            parent = emp._itz_parent_location()
            if emp.itz_stock_location_id:
                emp.itz_stock_location_id.sudo().write({
                    'name': emp.name, 'itz_technician_user_id': emp.user_id.id or False, 'active': True})
                continue
            loc = Location.create({
                'name': emp.name,
                'usage': 'internal',
                'location_id': parent.id,
                'itz_technician_user_id': emp.user_id.id or False,
                'company_id': emp.company_id.id,
            })
            emp.sudo().itz_stock_location_id = loc

    def _itz_parent_location(self):
        Location = self.env['stock.location'].sudo()
        wh = self.env['stock.warehouse'].sudo().search([('company_id', '=', self.company_id.id or self.env.company.id)], limit=1)
        parent = Location.search([('name', '=', 'Technicians'), ('location_id', '=', wh.view_location_id.id)], limit=1)
        if not parent:
            parent = Location.create({'name': 'Technicians', 'usage': 'view', 'location_id': wh.view_location_id.id, 'company_id': wh.company_id.id})
        # Technician stock sits under a "view" parent; children must be internal
        return parent

    def action_view_issued_devices(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window', 'name': _('Equipment in hand'), 'res_model': 'stock.lot',
            'view_mode': 'list,form', 'domain': [('itz_technician_user_id', '=', self.user_id.id)],
        }
