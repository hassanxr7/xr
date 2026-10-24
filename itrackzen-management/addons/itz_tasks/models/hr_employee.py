from odoo import api, fields, models, _


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    itz_task_ids = fields.One2many('itz.task', 'employee_id', string='Tasks')
    itz_open_task_count = fields.Integer(compute='_compute_itz_task_counts', string='Open tasks')
    itz_done_task_count = fields.Integer(compute='_compute_itz_task_counts', string='Completed tasks')
    itz_overdue_task_count = fields.Integer(compute='_compute_itz_task_counts', string='Overdue tasks')

    @api.depends('itz_task_ids.state', 'itz_task_ids.date_deadline')
    def _compute_itz_task_counts(self):
        for emp in self:
            tasks = emp.sudo().itz_task_ids
            emp.itz_open_task_count = len(tasks.filtered(lambda t: t.state in ('pending', 'in_progress')))
            emp.itz_done_task_count = len(tasks.filtered(lambda t: t.state == 'completed'))
            emp.itz_overdue_task_count = len(tasks.filtered('is_overdue'))

    def action_view_itz_tasks(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Tasks'), 'res_model': 'itz.task', 'view_mode': 'kanban,list,form',
                'domain': [('employee_id', '=', self.id)], 'context': {'default_assigned_user_id': self.user_id.id}}
