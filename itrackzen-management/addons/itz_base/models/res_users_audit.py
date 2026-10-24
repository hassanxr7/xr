from odoo import api, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        log = self.env['itz.audit.log']
        for user in users:
            cats = self.env.ref('itz_base.module_category_itz') | self.env.ref('itz_base.module_category_itz_privileges')
            roles = ', '.join(user.groups_id.filtered(lambda g: g.category_id in cats).mapped('name'))
            log.log('permission', 'User created', user, 'Roles: %s' % (roles or '-'))
        return users

    def write(self, vals):
        before = {u.id: (set(u.groups_id.ids), u.active) for u in self}
        res = super().write(vals)
        log = self.env['itz.audit.log']
        Group = self.env['res.groups'].sudo()
        for user in self:
            old_groups, old_active = before.get(user.id, (set(), user.active))
            new_groups = set(user.groups_id.ids)
            added, removed = new_groups - old_groups, old_groups - new_groups
            if added or removed:
                detail = []
                if added:
                    detail.append('Added: ' + ', '.join(Group.browse(sorted(added)).mapped('full_name')))
                if removed:
                    detail.append('Removed: ' + ', '.join(Group.browse(sorted(removed)).mapped('full_name')))
                log.log('permission', 'User permissions changed', user, '\n'.join(detail))
            if old_active != user.active:
                log.log('permission', 'User activated' if user.active else 'User archived', user, '')
        return res


class ResGroups(models.Model):
    _inherit = 'res.groups'

    def write(self, vals):
        watch = {'implied_ids', 'users', 'name'}
        before = {}
        if watch & set(vals):
            before = {g.id: (set(g.implied_ids.ids), set(g.users.ids)) for g in self}
        res = super().write(vals)
        if before:
            log = self.env['itz.audit.log']
            for g in self:
                oi, ou = before.get(g.id, (set(), set()))
                ni, nu = set(g.implied_ids.ids), set(g.users.ids)
                if oi != ni:
                    log.log('permission', 'Group inheritance changed', g, 'Implied groups: %s' % ', '.join(g.implied_ids.mapped('full_name')))
                if ou != nu:
                    log.log('permission', 'Group members changed', g, 'Members now: %d (added %d, removed %d)' % (len(nu), len(nu - ou), len(ou - nu)))
        return res


class IrModelAccess(models.Model):
    _inherit = 'ir.model.access'

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            self.env['itz.audit.log'].log('permission', 'Access right created', rec, '%s: r%d w%d c%d d%d' % (rec.model_id.model, rec.perm_read, rec.perm_write, rec.perm_create, rec.perm_unlink))
        return records

    def write(self, vals):
        res = super().write(vals)
        if any(k.startswith('perm_') or k in ('group_id', 'active') for k in vals):
            for rec in self:
                self.env['itz.audit.log'].log('permission', 'Access right changed', rec, '%s: r%d w%d c%d d%d' % (rec.model_id.model, rec.perm_read, rec.perm_write, rec.perm_create, rec.perm_unlink))
        return res

    def unlink(self):
        for rec in self:
            self.env['itz.audit.log'].log('permission', 'Access right deleted', rec, rec.name)
        return super().unlink()


class IrRule(models.Model):
    _inherit = 'ir.rule'

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            self.env['itz.audit.log'].log('permission', 'Record rule created', rec, rec.name)
        return records

    def write(self, vals):
        res = super().write(vals)
        for rec in self:
            self.env['itz.audit.log'].log('permission', 'Record rule changed', rec, rec.name)
        return res

    def unlink(self):
        for rec in self:
            self.env['itz.audit.log'].log('permission', 'Record rule deleted', rec, rec.name)
        return super().unlink()
