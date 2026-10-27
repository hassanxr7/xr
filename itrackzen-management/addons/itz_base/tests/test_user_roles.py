from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install', 'itz')
class TestUserRoleFields(TransactionCase):

    def test_roles_and_privileges_checkboxes_change_the_real_groups(self):
        accountant = self.env.ref('itz_base.group_itz_accountant')
        extra = self.env.ref('itz_base.group_itz_delete')
        user = self.env['res.users'].create({'name': 'Role Test', 'login': 'role.test@example.com', 'groups_id': [(5, 0, 0)]})
        user.itz_role_ids = accountant
        user.itz_privilege_ids = extra
        self.assertIn(accountant, user.groups_id)
        self.assertIn(extra, user.groups_id)
        self.assertIn(self.env.ref('base.group_user'), user.groups_id, 'the role still brings its implied internal-user group')
        self.assertEqual(user.itz_role_ids, accountant)
        self.assertIn(self.env.ref('itz_base.group_itz_financial'), user.itz_privilege_ids, 'the accountant role already includes financial information')
        user.itz_privilege_ids = self.env['res.groups']
        self.assertNotIn(extra, user.groups_id)
        self.assertIn(accountant, user.groups_id, 'removing a privilege keeps the role')
        user.itz_role_ids = self.env.ref('itz_base.group_itz_sales')
        self.assertNotIn(accountant, user.groups_id)
        self.assertEqual(user.itz_role_ids, self.env.ref('itz_base.group_itz_sales'))

    def test_other_groups_are_untouched(self):
        support = self.env.ref('itz_base.group_itz_support')
        user = self.env['res.users'].create({'name': 'Other Test', 'login': 'other.test@example.com'})
        other = self.env.ref('base.group_partner_manager')
        user.write({'groups_id': [(4, other.id)]})
        user.itz_role_ids = support
        user.itz_role_ids = self.env['res.groups']
        self.assertIn(other, user.groups_id)
