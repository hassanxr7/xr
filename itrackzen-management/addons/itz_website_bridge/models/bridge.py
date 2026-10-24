import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import urlsplit

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

# What each ITrackZen role may do in the website admin area. Owner gets everything.
ROLE_AREAS = {
    'itz_base.group_itz_owner': ['content', 'media', 'brand', 'enquiries', 'deletions', 'users'],
    'itz_base.group_itz_ops_manager': ['content', 'media', 'enquiries', 'deletions'],
    'itz_base.group_itz_sales': ['enquiries'],
    'itz_base.group_itz_support': ['enquiries', 'deletions'],
}
TOKEN_TTL = 90          # seconds a login token is valid
REQUEST_TTL = 120       # seconds a signed server-to-server request is valid


def b64e(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def b64d(text):
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


class ItzWebsiteConfig(models.Model):
    """Connection between this system and the ITrackZen website (itrackzen.net): single sign-on and event delivery."""
    _name = 'itz.website.config'
    _description = 'ITrackZen website connection'
    _inherit = ['mail.thread', 'itz.audit.mixin']

    _itz_audit_fields = ['enabled', 'website_url', 'admin_url', 'allowed_redirects']
    _itz_audit_category = 'integration'

    name = fields.Char(default='ITrackZen website', readonly=True)
    enabled = fields.Boolean(string='Single sign-on enabled', default=False, tracking=True)
    website_url = fields.Char(string='Website address', default='https://itrackzen.net', required=True)
    admin_url = fields.Char(string='Website admin address', default='https://itrackzen.net/admin/', required=True)
    allowed_redirects = fields.Text(
        string='Allowed sign-in return addresses', default='https://itrackzen.net/admin/sso.php',
        help='One address per line. After sign-in the browser is sent back only to an address that starts with one of these.')
    shared_secret = fields.Char(string='Shared secret', groups='itz_base.group_itz_owner', copy=False,
                                default=lambda self: secrets.token_urlsafe(48),
                                help='Put the same value in the website file includes/config.local.php as ODOO_SSO_SECRET.')
    accept_events = fields.Boolean(string='Accept enquiries and deletion requests from the website', default=True)
    default_sales_user_id = fields.Many2one('res.users', string='New enquiries go to', domain="[('share', '=', False)]")
    default_support_user_id = fields.Many2one('res.users', string='Deletion requests go to', domain="[('share', '=', False)]")
    deletion_deadline_days = fields.Integer(string='Deletion request target (days)', default=30)
    last_event_at = fields.Datetime(readonly=True)
    event_count = fields.Integer(compute='_compute_event_count')

    def _compute_event_count(self):
        count = self.env['itz.website.event'].search_count([])
        for cfg in self:
            cfg.event_count = count

    @api.model
    def get_config(self):
        cfg = self.sudo().search([], limit=1)
        if not cfg:
            cfg = self.sudo().create({})
        return cfg

    @api.constrains('allowed_redirects')
    def _check_redirects(self):
        for cfg in self:
            for line in (cfg.allowed_redirects or '').splitlines():
                line = line.strip()
                if line and not (line.startswith('https://') or line.startswith('http://localhost') or line.startswith('http://127.0.0.1')):
                    raise ValidationError(_('Return addresses must use https:// (only localhost may use http://): %s', line))

    def write(self, vals):
        if not self.env.su and not self.env.user.has_group('itz_base.group_itz_owner'):
            raise UserError(_('Only the owner can change the website connection.'))
        return super().write(vals)

    def action_regenerate_secret(self):
        self.ensure_one()
        self.sudo().shared_secret = secrets.token_urlsafe(48)
        self.env['itz.audit.log'].log('security', 'Website shared secret regenerated', self)

    # --------------------------------------------------------------- signing
    def _key(self):
        self.ensure_one()
        return (self.sudo().shared_secret or '').encode()

    def sign(self, data):
        if isinstance(data, str):
            data = data.encode()
        return hmac.new(self._key(), data, hashlib.sha256).hexdigest()

    def verify(self, data, signature):
        return bool(signature) and hmac.compare_digest(self.sign(data), signature)

    def redirect_allowed(self, url):
        self.ensure_one()
        if not url:
            return False
        parts = urlsplit(url)
        if parts.scheme not in ('https', 'http') or not parts.netloc:
            return False
        for line in (self.allowed_redirects or '').splitlines():
            line = line.strip()
            if line and url == line or (line and url.startswith(line + '?')):
                return True
        return False

    # --------------------------------------------------------------- tokens
    def make_login_token(self, user, state):
        self.ensure_one()
        now = int(time.time())
        payload = {
            'v': 1, 'uid': user.id, 'login': user.login, 'name': user.name, 'email': user.email or '',
            'roles': self.roles_of(user), 'areas': self.areas_of(user), 'menus': self.menus_of(user),
            'state': state, 'nonce': secrets.token_urlsafe(12), 'iat': now, 'exp': now + TOKEN_TTL,
        }
        body = b64e(json.dumps(payload, separators=(',', ':'), sort_keys=True).encode())
        return body + '.' + self.sign(body)

    def check_login_token(self, token):
        """Used by tests and diagnostics; the website performs the same check."""
        try:
            body, sig = token.split('.', 1)
        except ValueError:
            return None
        if not self.verify(body, sig):
            return None
        payload = json.loads(b64d(body))
        return payload if payload.get('exp', 0) >= time.time() else None

    @api.model
    def roles_of(self, user):
        names = {
            'itz_base.group_itz_owner': 'owner', 'itz_base.group_itz_ops_manager': 'ops_manager', 'itz_base.group_itz_sales': 'sales',
            'itz_base.group_itz_accountant': 'accountant', 'itz_base.group_itz_storekeeper': 'storekeeper',
            'itz_base.group_itz_technician': 'technician', 'itz_base.group_itz_support': 'support', 'itz_base.group_itz_readonly': 'readonly',
        }
        if user.has_group('itz_base.group_itz_owner'):
            return ['owner']
        return [key for xmlid, key in names.items() if self.env.ref(xmlid) in user.groups_id]

    @api.model
    def areas_of(self, user):
        areas = set()
        for xmlid, vals in ROLE_AREAS.items():
            if user.has_group(xmlid):
                areas.update(vals)
        return sorted(areas)

    @api.model
    def menus_of(self, user):
        """The workspace entries this person can open in the management system: [{key, label, path}]."""
        Menu = self.env(user=user.id)['ir.ui.menu']
        root = self.env.ref('itz_base.menu_itz_root')
        visible = set(Menu._visible_menu_ids())
        entries = []
        Full = self.env['ir.ui.menu'].sudo().with_context(**{'ir.ui.menu.full_list': True})
        for child in Full.search([('parent_id', '=', root.id)], order='sequence'):
            if child.id not in visible:
                continue
            action = self._first_action(child, visible)
            if not action:
                continue
            entries.append({'key': child.complete_name.split('/')[-1].lower().replace(' ', '_'), 'label': child.name, 'path': '/odoo/action-%s' % action})
        return entries

    def _first_action(self, menu, visible):
        menu = menu.sudo()
        if menu.action and menu.action._name in ('ir.actions.act_window', 'ir.actions.client', 'ir.actions.server'):
            return menu.action.id
        Full = self.env['ir.ui.menu'].sudo().with_context(**{'ir.ui.menu.full_list': True})
        for child in Full.search([('parent_id', '=', menu.id)], order='sequence'):
            if child.id in visible:
                found = self._first_action(child, visible)
                if found:
                    return found
        return False


class ItzWebsiteEvent(models.Model):
    """Events received from the website. Used for idempotency and as a trail."""
    _name = 'itz.website.event'
    _description = 'Website event'
    _order = 'id desc'

    event_id = fields.Char(required=True, index=True, copy=False)
    event_type = fields.Char(index=True)
    state = fields.Selection([('done', 'Processed'), ('ignored', 'Ignored'), ('error', 'Error')], default='done')
    note = fields.Char()
    res_model = fields.Char()
    res_id = fields.Integer()
    payload = fields.Text()

    _sql_constraints = [('event_unique', 'unique(event_id)', 'Event already received.')]

    @api.model
    def ingest(self, event):
        cfg = self.env['itz.website.config'].get_config()
        event_id = str(event.get('id') or '')
        etype = str(event.get('type') or '')
        data = event.get('data') or {}
        if not event_id or not etype:
            return {'status': 'error', 'message': 'id and type are required'}
        if self.sudo().search_count([('event_id', '=', event_id)]):
            return {'status': 'duplicate'}
        rec = self.sudo().create({'event_id': event_id, 'event_type': etype, 'payload': json.dumps(event, default=str)[:20000]})
        handler = getattr(self, '_handle_%s' % etype.replace('.', '_'), None)
        if not handler:
            rec.write({'state': 'ignored', 'note': 'unknown event type'})
            return {'status': 'ignored'}
        record = handler(data)
        cfg.sudo().last_event_at = fields.Datetime.now()
        if record:
            rec.write({'res_model': record._name, 'res_id': record.id, 'note': record.display_name})
        return {'status': 'ok', 'id': record.id if record else None}

    # ---- enquiries
    @api.model
    def _handle_enquiry_created(self, data):
        Enquiry = self.env['itz.enquiry'].sudo()
        ref = str(data.get('ref') or '')
        existing = Enquiry.search([('website_ref', '=', ref)], limit=1) if ref else Enquiry
        if existing:
            return existing
        cfg = self.env['itz.website.config'].get_config()
        etype = data.get('type') if data.get('type') in ('contact', 'quote', 'demo', 'partner') else 'contact'
        extra = data.get('extra') or {}
        message = data.get('message') or ''
        if extra:
            message += '\n\n' + '\n'.join('%s: %s' % (k, v) for k, v in extra.items() if v)
        return Enquiry.create({
            'website_ref': ref or False, 'enquiry_type': etype, 'contact_name': data.get('full_name') or data.get('email') or _('Website visitor'),
            'company_name': data.get('company') or False, 'email': data.get('email') or False, 'phone': data.get('phone') or False,
            'country': data.get('country') or False, 'vehicles': data.get('vehicles') or False, 'service': data.get('service') or False,
            'message': message, 'user_id': cfg.default_sales_user_id.id or False,
        })

    @api.model
    def _handle_enquiry_updated(self, data):
        enq = self.env['itz.enquiry'].sudo().search([('website_ref', '=', str(data.get('ref') or ''))], limit=1)
        if enq and data.get('status') == 'spam':
            enq.state = 'spam'
        elif enq and data.get('status') in ('replied', 'in_progress') and enq.state == 'new':
            enq.state = 'contacted'
        elif enq and data.get('status') == 'closed' and enq.state in ('new', 'contacted'):
            enq.state = 'lost'
        return enq

    # ---- account deletion requests (handled on the website; a task makes them visible to staff here)
    @api.model
    def _handle_deletion_created(self, data):
        Task = self.env['itz.task'].sudo()
        ref = str(data.get('ref') or '')
        existing = Task.search([('name', 'ilike', ref)], limit=1) if ref else Task
        if existing:
            return existing
        cfg = self.env['itz.website.config'].get_config()
        assignee = cfg.default_support_user_id or self.env.ref('base.user_admin')
        deadline = fields.Datetime.now() + __import__('datetime').timedelta(days=cfg.deletion_deadline_days or 30)
        link = '%s?v=deletions' % cfg.admin_url
        return Task.create({
            'name': _('Account deletion request %s', ref), 'task_type': 'support', 'priority': '3', 'assigned_user_id': assignee.id,
            'date_deadline': deadline,
            'description': '<p>%s</p><p><a href="%s">Open in the website admin</a></p>' % (
                _('Handle this request in the website admin area: verify identity, delete or retain data, then confirm to the requester. Status: %s.', data.get('status') or ''), link),
        })

    @api.model
    def _handle_deletion_updated(self, data):
        task = self.env['itz.task'].sudo().search([('name', 'ilike', str(data.get('ref') or '')), ('task_type', '=', 'support')], limit=1)
        if task and data.get('status') in ('completed', 'rejected', 'expired'):
            task.write({'state': 'completed', 'date_done': fields.Datetime.now(), 'result_note': _('Closed on the website: %s', data.get('status'))})
            task.activity_feedback(['mail.mail_activity_data_todo'])
        elif task:
            task.message_post(body=_('Website status: %s', data.get('status')))
        return task
