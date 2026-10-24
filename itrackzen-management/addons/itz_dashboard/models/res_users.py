from odoo import api, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        action = self.env.ref('itz_dashboard.action_itz_dashboard', raise_if_not_found=False)
        if action:
            cats = self.env.ref('itz_base.module_category_itz')
            for user in users.filtered(lambda u: not u.share and not u.action_id and u.groups_id.filtered(lambda g: g.category_id == cats)):
                user.sudo().action_id = action.id
        return users

    def write(self, vals):
        res = super().write(vals)
        if 'groups_id' in vals:
            action = self.env.ref('itz_dashboard.action_itz_dashboard', raise_if_not_found=False)
            cats = self.env.ref('itz_base.module_category_itz')
            if action:
                for user in self.filtered(lambda u: not u.share and not u.action_id and u.groups_id.filtered(lambda g: g.category_id == cats)):
                    user.sudo().action_id = action.id
        return res
