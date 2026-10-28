from datetime import timedelta

from odoo import api, fields, models

GAP = 150            # seconds: a longer silence than this is not counted as working time
ONLINE_WINDOW = 150  # seconds: seen within this long ago means "online now"


class ItzPresence(models.Model):
    """Active time in the management system, per person and day. The browser sends a small signal every minute while the person
    has the page open and has used the mouse or keyboard in the last five minutes. Idle or closed pages add nothing."""
    _name = 'itz.presence'
    _description = 'Hours online'
    _order = 'date desc, user_id'

    user_id = fields.Many2one('res.users', required=True, index=True, ondelete='cascade')
    date = fields.Date(required=True, index=True)
    seconds = fields.Integer(string='Active seconds', default=0)
    hours = fields.Float(compute='_compute_hours', string='Hours online', store=True, digits=(16, 2))
    first_seen = fields.Datetime()
    last_seen = fields.Datetime()

    _sql_constraints = [('user_day_unique', 'unique(user_id, date)', 'One record per person and day.')]

    @api.depends('seconds')
    def _compute_hours(self):
        for rec in self:
            rec.hours = round(rec.seconds / 3600.0, 2)

    # ---------------------------------------------------------------- heartbeat
    @api.model
    def ping(self):
        """Called by the browser every minute while the person is active. Adds the time since the previous signal when it was recent."""
        now = fields.Datetime.now()
        today = fields.Date.context_today(self)
        rec = self.sudo().search([('user_id', '=', self.env.uid), ('date', '=', today)], limit=1)
        if not rec:
            self.sudo().create({'user_id': self.env.uid, 'date': today, 'first_seen': now, 'last_seen': now})
            return True
        delta = int((now - rec.last_seen).total_seconds()) if rec.last_seen else 0
        rec.write({'seconds': rec.seconds + (min(delta, GAP) if 0 < delta <= GAP else 0), 'last_seen': now})
        return True

    # ---------------------------------------------------------------- reading
    @api.model
    def _summary_for(self, users, today=None):
        now = fields.Datetime.now()
        today = today or fields.Date.context_today(self)
        week_start = today - timedelta(days=today.weekday())
        rows = self.sudo().search([('user_id', 'in', users.ids), ('date', '>=', week_start), ('date', '<=', today)])
        out = []
        for user in users:
            mine = rows.filtered(lambda r: r.user_id == user)
            day = mine.filtered(lambda r: r.date == today)[:1]
            last = max(mine.mapped('last_seen') or [False]) if mine else False
            out.append({
                'id': user.id, 'name': user.name, 'avatar': '/web/image/res.users/%s/avatar_128' % user.id,
                'online': bool(last and (now - last).total_seconds() <= ONLINE_WINDOW),
                'today_minutes': (day.seconds if day else 0) // 60, 'week_minutes': sum(mine.mapped('seconds')) // 60,
                'first_seen': fields.Datetime.to_string(day.first_seen) if day and day.first_seen else False,
                'last_seen': fields.Datetime.to_string(last) if last else False,
            })
        return out

    @api.model
    def dashboard_data(self):
        """Own hours for everybody; the whole team for operations managers and owners."""
        user = self.env.user
        data = {'me': self._summary_for(user)[0], 'team': []}
        if user.has_group('itz_base.group_itz_ops_manager'):
            roles = self.env['res.groups'].search([('category_id', '=', self.env.ref('itz_base.module_category_itz').id)])
            staff = self.env['res.users'].sudo().search([('share', '=', False), ('active', '=', True), ('groups_id', 'in', roles.ids), ('id', '!=', 1)])
            team = self._summary_for(staff)
            team.sort(key=lambda r: (not r['online'], -r['today_minutes'], r['name']))
            data['team'] = team
        return data
