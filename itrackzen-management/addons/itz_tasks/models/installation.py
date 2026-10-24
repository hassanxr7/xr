from odoo import api, fields, models, _


class ItzInstallation(models.Model):
    _inherit = 'itz.installation'

    task_id = fields.Many2one('itz.task', string='Task', copy=False, readonly=True)

    def action_schedule(self):
        res = super().action_schedule()
        for job in self.sudo():
            if job.technician_id and not job.task_id:
                job.task_id = self.env['itz.task'].create({
                    'name': _('Install %(plate)s (%(job)s)', plate=job.plate, job=job.name),
                    'task_type': 'installation' if job.job_type in ('install', 'replace', 'move') else 'maintenance',
                    'assigned_user_id': job.technician_id.id, 'partner_id': job.partner_id.id, 'vehicle_id': job.vehicle_id.id,
                    'installation_id': job.id, 'date_deadline': job.date_planned, 'priority': '1',
                })
            elif job.task_id and job.technician_id:
                job.task_id.assigned_user_id = job.technician_id
        return res

    def action_start(self):
        res = super().action_start()
        self.sudo().mapped('task_id').filtered(lambda t: t.state == 'pending').write({'state': 'in_progress'})
        return res

    def _itz_after_done(self):
        res = super()._itz_after_done()
        for job in self.sudo():
            if job.task_id and job.task_id.state not in ('completed', 'cancelled'):
                job.task_id.write({'state': 'completed', 'date_done': fields.Datetime.now(), 'result_note': job._itz_summary()})
                job.task_id.activity_feedback(['mail.mail_activity_data_todo'])
        return res

    def action_cancel(self):
        res = super().action_cancel()
        self.sudo().mapped('task_id').filtered(lambda t: t.state in ('pending', 'in_progress')).write({'state': 'cancelled'})
        return res
