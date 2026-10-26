import hashlib
import hmac
import json
import secrets

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class ItzPlatformConfig(models.Model):
    """Connection settings for the ITrackZen tracking platform. One record per company."""
    _name = 'itz.platform.config'
    _description = 'Tracking platform connection'
    _inherit = ['mail.thread', 'itz.audit.mixin']
    _rec_name = 'company_id'

    _itz_audit_fields = ['mode', 'platform_type', 'base_url', 'api_base_url', 'auth_type', 'gpswox_create_clients', 'gpswox_push_expiry', 'gpswox_deactivate_expired']
    _itz_audit_category = 'integration'

    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True, ondelete='cascade')
    mode = fields.Selection([
        ('disabled', 'Disabled: nothing is sent'),
        ('dry_run', 'Dry run: log what would be sent, send nothing'),
        ('mock', 'Staging simulator: pretend the platform accepted it'),
        ('live', 'Live: send to the tracking platform'),
    ], default='disabled', required=True, tracking=True,
        help='Always test in Dry run, then Staging simulator, and only then switch to Live.')
    platform_type = fields.Selection([
        ('generic', 'ITrackZen integration layer (JSON API)'), ('gpswox', 'GPSWOX / GPS-Server (its own API)')],
        default='generic', required=True, tracking=True,
        help='GPSWOX: the management system signs in with a service account and uses the platform API (api/login, add_device, ...).')
    gpswox_email = fields.Char(string='Service account email', groups='itz_base.group_itz_owner',
                               help='A dedicated platform account for this connection (not a person\'s account).')
    gpswox_password = fields.Char(string='Service account password', groups='itz_base.group_itz_owner')
    gpswox_hash = fields.Char(string='Session key (automatic)', groups='itz_base.group_itz_owner', copy=False, readonly=True)
    gpswox_create_clients = fields.Boolean(string='Create customer accounts in the platform', default=False,
                                           help='Off by default: creating an account can make the platform email the customer. Devices are always created.')
    gpswox_push_expiry = fields.Boolean(string='Send subscription expiry date to the platform', default=True)
    gpswox_deactivate_expired = fields.Boolean(string='Deactivate the device when the subscription expires', default=False,
                                               help='Off by default: switching a device off stops its tracking in the platform.')
    base_url = fields.Char(string='Platform web address', default='https://itrackzen.com',
                           help='Used to build the "Open in tracking platform" links.')
    customer_url_tpl = fields.Char(string='Customer page link', help='Placeholders: {base} {id} {email}. Example: {base}/admin/clients/{id}')
    vehicle_url_tpl = fields.Char(string='Vehicle page link', help='Placeholders: {base} {id} {imei} {plate}. Example: {base}/admin/objects/{id}')
    device_url_tpl = fields.Char(string='Device page link', help='Placeholders: {base} {id} {imei}')
    live_map_url_tpl = fields.Char(string='Live map link', help='Placeholders: {base} {id} {imei} {plate}. Opens the vehicle on the live map.')

    api_base_url = fields.Char(string='Platform API address', help='For example https://itrackzen.com/api/itz (the integration layer).')
    auth_type = fields.Selection([('none', 'None'), ('bearer', 'Bearer token'), ('header', 'Custom header'), ('basic', 'Basic (user:password)')], default='bearer')
    auth_header = fields.Char(string='Header name', default='X-API-Key')
    api_key = fields.Char(string='API key / token', groups='itz_base.group_itz_owner')
    signing_secret = fields.Char(string='Signing secret', groups='itz_base.group_itz_owner', copy=False, default=lambda self: secrets.token_urlsafe(32),
                                 help='Shared secret used to sign requests sent to the platform and to verify webhooks coming from it.')
    ep_customer = fields.Char(string='Customers endpoint', default='/customers')
    ep_vehicle = fields.Char(string='Vehicles endpoint', default='/vehicles')
    ep_device = fields.Char(string='Devices endpoint', default='/devices')
    ep_service = fields.Char(string='Service status endpoint', default='/services')
    timeout = fields.Integer(string='Timeout (seconds)', default=15)
    max_attempts = fields.Integer(default=8)
    sync_customers = fields.Boolean(default=True)
    sync_vehicles = fields.Boolean(default=True)
    sync_devices = fields.Boolean(default=True)
    sync_service = fields.Boolean(string='Push service status (active, suspended, expired)', default=True)
    last_ok = fields.Datetime(readonly=True)
    last_error = fields.Text(readonly=True)
    job_count_pending = fields.Integer(compute='_compute_counts')
    job_count_failed = fields.Integer(compute='_compute_counts')

    _sql_constraints = [('company_unique', 'unique(company_id)', 'There is only one platform connection per company.')]

    def _compute_counts(self):
        Job = self.env['itz.sync.job']
        for cfg in self:
            cfg.job_count_pending = Job.search_count([('company_id', '=', cfg.company_id.id), ('state', '=', 'pending')])
            cfg.job_count_failed = Job.search_count([('company_id', '=', cfg.company_id.id), ('state', '=', 'failed')])

    @api.model
    def get_config(self, company=None):
        company = company or self.env.company
        cfg = self.sudo().search([('company_id', '=', company.id)], limit=1)
        if not cfg:
            cfg = self.sudo().create({'company_id': company.id})
        return cfg

    @api.constrains('mode', 'api_base_url', 'platform_type', 'gpswox_email')
    def _check_live(self):
        for cfg in self:
            if cfg.mode == 'live' and not cfg.api_base_url:
                raise ValidationError(_('Enter the platform API address before switching to Live.'))
            if cfg.mode == 'live' and cfg.platform_type == 'gpswox' and not cfg.sudo().gpswox_email:
                raise ValidationError(_('Enter the platform service account before switching to Live.'))

    def write(self, vals):
        if 'mode' in vals and not self.env.su:
            if not self.env.user.has_group('itz_base.group_itz_owner'):
                raise UserError(_('Only the owner can change the integration mode.'))
        return super().write(vals)

    # ----------------------------------------------------------- links
    def _link(self, template, **values):
        self.ensure_one()
        if not template:
            return False
        data = {'base': (self.base_url or '').rstrip('/'), 'id': '', 'imei': '', 'plate': '', 'email': ''}
        data.update({k: (v or '') for k, v in values.items()})
        try:
            return template.format(**data)
        except (KeyError, IndexError):
            return False

    # ----------------------------------------------------------- signing
    def sign(self, body_bytes):
        self.ensure_one()
        secret = (self.sudo().signing_secret or '').encode()
        return hmac.new(secret, body_bytes, hashlib.sha256).hexdigest()

    def verify(self, body_bytes, signature):
        self.ensure_one()
        return bool(signature) and hmac.compare_digest(self.sign(body_bytes), signature)

    def action_regenerate_secret(self):
        self.ensure_one()
        self.sudo().signing_secret = secrets.token_urlsafe(32)
        self.env['itz.audit.log'].log('integration', 'Signing secret regenerated', self)

    def action_test_connection(self):
        self.ensure_one()
        adapter = self.env['itz.platform.adapter'].adapter_for(self)
        ok, message = adapter.ping()
        self.sudo().write({'last_ok': fields.Datetime.now() if ok else self.last_ok, 'last_error': False if ok else message})
        return {'type': 'ir.actions.client', 'tag': 'display_notification',
                'params': {'title': _('Connection test'), 'message': message, 'type': 'success' if ok else 'warning', 'sticky': not ok}}

    def action_view_jobs(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Sync queue'), 'res_model': 'itz.sync.job', 'view_mode': 'list,form'}
