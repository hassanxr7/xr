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

    def _inverse_itz_roles(self):
        self._itz_apply('itz_role_ids', 'itz_base.module_category_itz')

    def _inverse_itz_privileges(self):
        self._itz_apply('itz_privilege_ids', 'itz_base.module_category_itz_privileges')
