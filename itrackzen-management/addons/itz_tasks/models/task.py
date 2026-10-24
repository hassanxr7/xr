from odoo import api, fields, models, _
from odoo.exceptions import UserError

TASK_TYPES = [
    ('installation', 'Installation'), ('maintenance', 'Maintenance / repair'), ('support', 'Customer support'),
    ('sales_followup', 'Sales follow-up'), ('payment_collection', 'Payment collection'), ('stock', 'Stock / store'), ('admin', 'Administration'),
]


class ItzTask(models.Model):
    _name = 'itz.task'
    _description = 'ITrackZen task'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'itz.audit.mixin']
    _order = 'priority desc, date_deadline, id desc'

    _itz_audit_fields = ['assigned_user_id', 'state']
    _itz_audit_category = 'other'

    name = fields.Char(string='Task', required=True, tracking=True)
    ref = fields.Char(string='Reference', copy=False, readonly=True, default=lambda self: _('New'), index=True)
    task_type = fields.Selection(TASK_TYPES, string='Type', default='support', required=True, tracking=True, index=True)
    state = fields.Selection([('pending', 'Pending'), ('in_progress', 'In progress'), ('completed', 'Completed'), ('cancelled', 'Cancelled')],
                             default='pending', tracking=True, index=True, copy=False, group_expand='_read_group_states')
    display_status = fields.Selection([('pending', 'Pending'), ('in_progress', 'In progress'), ('completed', 'Completed'),
                                       ('overdue', 'Overdue'), ('cancelled', 'Cancelled')], compute='_compute_display_status', search='_search_display_status', string='Status')
    priority = fields.Selection([('0', 'Low'), ('1', 'Normal'), ('2', 'High'), ('3', 'Urgent')], default='1', tracking=True)
    assigned_user_id = fields.Many2one('res.users', string='Owner', required=True, default=lambda self: self.env.user, tracking=True, index=True,
                                       domain="[('share', '=', False)]")
    employee_id = fields.Many2one('hr.employee', compute='_compute_employee', store=True, string='Employee')
    department_id = fields.Many2one('hr.department', related='employee_id.department_id', store=True, string='Department')
    partner_id = fields.Many2one('res.partner', string='Customer', index=True, tracking=True, domain="[('parent_id', '=', False)]")
    vehicle_id = fields.Many2one('itz.vehicle', string='Vehicle', index=True, domain="[('partner_id', '=?', partner_id)]")
    installation_id = fields.Many2one('itz.installation', string='Installation job', index=True, copy=False)
    subscription_id = fields.Many2one('itz.subscription', string='Subscription', index=True, copy=False)
    invoice_id = fields.Many2one('account.move', string='Invoice', copy=False, index=True, groups='itz_base.group_itz_financial')
    date_deadline = fields.Datetime(string='Deadline', tracking=True, index=True)
    date_done = fields.Datetime(string='Completed on', copy=False, readonly=True)
    description = fields.Html(string='Details')
    result_note = fields.Text(string='Outcome', help='What was done / result of the task.')
    attachment_ids = fields.Many2many('ir.attachment', string='Attachments')
    is_overdue = fields.Boolean(compute='_compute_display_status', search='_search_is_overdue')
    create_user_id = fields.Many2one('res.users', related='create_uid', string='Created by')
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)
    color = fields.Integer()

    @api.model
    def _read_group_states(self, states, domain):
        return [key for key, _label in type(self).state.selection if key != 'cancelled']

    @api.depends('assigned_user_id')
    def _compute_employee(self):
        for task in self:
            task.employee_id = self.env['hr.employee'].sudo().search([('user_id', '=', task.assigned_user_id.id)], limit=1)

    @api.depends('state', 'date_deadline')
    def _compute_display_status(self):
        now = fields.Datetime.now()
        for task in self:
            late = bool(task.state in ('pending', 'in_progress') and task.date_deadline and task.date_deadline < now)
            task.is_overdue = late
            task.display_status = 'overdue' if late else task.state

    def _search_is_overdue(self, operator, value):
        positive = (operator == '=' and value) or (operator == '!=' and not value)
        dom = [('state', 'in', ('pending', 'in_progress')), ('date_deadline', '<', fields.Datetime.now())]
        if positive:
            return dom
        return ['|', ('state', 'in', ('completed', 'cancelled')), '|', ('date_deadline', '=', False), ('date_deadline', '>=', fields.Datetime.now())]

    def _search_display_status(self, operator, value):
        values = value if isinstance(value, (list, tuple)) else [value]
        doms = []
        now = fields.Datetime.now()
        for v in values:
            if v == 'overdue':
                doms.append([('state', 'in', ('pending', 'in_progress')), ('date_deadline', '<', now)])
            elif v in ('pending', 'in_progress'):
                doms.append([('state', '=', v), '|', ('date_deadline', '=', False), ('date_deadline', '>=', now)])
            else:
                doms.append([('state', '=', v)])
        ids = sum((self.search(d).ids for d in doms), [])
        return [('id', 'in' if operator in ('=', 'in') else 'not in', ids)]

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('ref') or vals['ref'] == _('New'):
                vals['ref'] = self.env['ir.sequence'].next_by_code('itz.task') or _('New')
        tasks = super().create(vals_list)
        for task in tasks:
            if task.assigned_user_id and task.assigned_user_id != self.env.user:
                task.activity_schedule('mail.mail_activity_data_todo', user_id=task.assigned_user_id.id,
                                       date_deadline=task.date_deadline.date() if task.date_deadline else fields.Date.today(),
                                       summary=task.name, note=_('%s asked you to handle this task.', self.env.user.name))
        return tasks

    def write(self, vals):
        if 'assigned_user_id' in vals and not self.env.su:
            user = self.env.user
            if not (user.has_group('itz_base.group_itz_ops_manager') or all(t.create_uid == user for t in self)):
                raise UserError(_('Only the creator or an operations manager can reassign a task.'))
        res = super().write(vals)
        if 'assigned_user_id' in vals:
            for task in self.filtered(lambda t: t.assigned_user_id and t.state in ('pending', 'in_progress')):
                if task.assigned_user_id != self.env.user:
                    task.activity_schedule('mail.mail_activity_data_todo', user_id=task.assigned_user_id.id,
                                           date_deadline=task.date_deadline.date() if task.date_deadline else fields.Date.today(), summary=task.name)
        return res

    def action_start(self):
        for task in self:
            if task.state != 'pending':
                raise UserError(_('Only pending tasks can be started.'))
            task._check_owner()
        self.write({'state': 'in_progress'})

    def action_done(self):
        for task in self:
            if task.state in ('completed', 'cancelled'):
                raise UserError(_('%s is already closed.', task.ref))
            task._check_owner()
        self.write({'state': 'completed', 'date_done': fields.Datetime.now()})
        self.activity_feedback(['mail.mail_activity_data_todo'])

    def action_cancel(self):
        for task in self:
            task._check_owner(allow_creator=True)
        self.write({'state': 'cancelled'})
        self.activity_unlink(['mail.mail_activity_data_todo'])

    def action_reopen(self):
        self.filtered(lambda t: t.state in ('completed', 'cancelled')).write({'state': 'pending', 'date_done': False})

    def _check_owner(self, allow_creator=False):
        self.ensure_one()
        user = self.env.user
        if self.env.su or user.has_group('itz_base.group_itz_ops_manager'):
            return
        if self.assigned_user_id == user or (allow_creator and self.create_uid == user):
            return
        raise UserError(_('Only the task owner or an operations manager can do this.'))

    @api.model
    def _cron_collection_tasks(self):
        """One collection task per overdue invoice."""
        today = fields.Date.context_today(self)
        for company in self.env['res.company'].search([('itz_collection_tasks', '=', True)]):
            limit = fields.Date.subtract(today, days=company.itz_collection_days)
            invoices = self.env['account.move'].sudo().search([
                ('move_type', '=', 'out_invoice'), ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial')),
                ('invoice_date_due', '<=', limit), ('company_id', '=', company.id)])
            for inv in invoices:
                if self.sudo().search_count([('invoice_id', '=', inv.id), ('task_type', '=', 'payment_collection')]):
                    continue
                accountant = self.env.ref('itz_base.group_itz_accountant').users.filtered(lambda u: u.active)[:1] or self.env.ref('base.user_admin')
                self.sudo().create({
                    'name': _('Collect payment: %(inv)s (%(cust)s)', inv=inv.name, cust=inv.partner_id.name),
                    'task_type': 'payment_collection', 'partner_id': inv.partner_id.commercial_partner_id.id, 'invoice_id': inv.id,
                    'assigned_user_id': accountant.id, 'priority': '2', 'date_deadline': fields.Datetime.now() + __import__('datetime').timedelta(days=2),
                    'description': _('<p>Invoice %(inv)s for %(amt)s was due on %(d)s and is still unpaid.</p>', inv=inv.name, amt=inv.amount_residual, d=inv.invoice_date_due),
                })
        return True
