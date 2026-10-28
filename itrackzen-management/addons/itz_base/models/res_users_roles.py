from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ResUsers(models.Model):
    """Odoo 18 only shows non-linear groups in developer mode. These two fields show the ITrackZen roles and privileges
    as ordinary check boxes on the user form; they read and write the normal groups, so nothing else changes."""
    _inherit = 'res.users'

    itz_role_ids = fields.Many2many(
        'res.groups', string='ITrackZen role', compute='_compute_itz_roles', inverse='_inverse_itz_roles',
        domain=lambda self: [('category_id', '=', self.env.ref('itz_base.module_category_itz').id)],
        help='What this person does. Give one role (two only if the person really has two jobs).')
    itz_privilege_ids = fields.Many2many(
        'res.groups', string='ITrackZen extra privileges', compute='_compute_itz_roles', inverse='_inverse_itz_privileges',
        domain=lambda self: [('category_id', '=', self.env.ref('itz_base.module_category_itz_privileges').id)],
        help='Extra permissions added to the role, for example Financial information.')

    def _itz_groups(self, xmlid):
        return self.env['res.groups'].search([('category_id', '=', self.env.ref(xmlid).id)])

    @api.depends('groups_id')
    def _compute_itz_roles(self):
        roles, privileges = self._itz_groups('itz_base.module_category_itz'), self._itz_groups('itz_base.module_category_itz_privileges')
        for user in self:
            user.itz_role_ids = user.groups_id & roles
            user.itz_privilege_ids = user.groups_id & privileges

    def _itz_apply(self, field, xmlid):
        allowed = self._itz_groups(xmlid)
        for user in self:
            wanted = user[field] & allowed
            current = user.groups_id & allowed
            commands = [(4, g.id) for g in wanted - current] + [(3, g.id) for g in current - wanted]
            if commands:
                user.write({'groups_id': commands})

    # The standard Odoo rights a new user often arrives with (Sales, Invoicing, Inventory, Purchase, Employees, Marketing, Dashboard,
    # Administration...). An ITrackZen role already gives everything the job needs, so choosing a role clears these. Extra rights can
    # still be added afterwards on the Access Rights tab; they stay until a role is chosen again.
    STANDARD_APP_GROUPS = (
        'sales_team.group_sale_manager', 'sales_team.group_sale_salesman_all_leads', 'sales_team.group_sale_salesman',
        'stock.group_stock_manager', 'stock.group_stock_user', 'purchase.group_purchase_manager', 'purchase.group_purchase_user',
        'account.group_account_manager', 'account.group_account_user', 'account.group_account_invoice', 'account.group_account_readonly',
        'account.group_validate_bank_account', 'hr.group_hr_manager', 'hr.group_hr_user', 'mass_mailing.group_mass_mailing_user',
        'spreadsheet_dashboard.group_dashboard_manager', 'mail.group_mail_canned_response_admin', 'base.group_erp_manager', 'base.group_system',
    )

    def _inverse_itz_roles(self):
        self._itz_apply('itz_role_ids', 'itz_base.module_category_itz')
        standard = self.env['res.groups']
        for xmlid in self.STANDARD_APP_GROUPS:
            standard |= self.env.ref(xmlid, raise_if_not_found=False) or standard.browse()
        for user in self:
            roles = user.itz_role_ids
            # never strip someone who is not being given a role, the person doing the editing (no self lock-out), or the system user
            if not roles or user == self.env.user or user.id in (1, 2) and not self.env.user._is_superuser():
                continue
            needed = roles | roles.trans_implied_ids | user.itz_privilege_ids.trans_implied_ids
            drop = standard - needed
            if drop & user.groups_id:
                user.write({'groups_id': [(3, g.id) for g in drop & user.groups_id]})

    def _inverse_itz_privileges(self):
        self._itz_apply('itz_privilege_ids', 'itz_base.module_category_itz_privileges')
