import logging
from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

AUDIT_CATEGORIES = [
    ('stock', 'Stock'), ('payment', 'Payment'), ('approval', 'Approval'), ('permission', 'Permission'),
    ('installation', 'Installation'), ('subscription', 'Subscription'), ('sales', 'Sales'),
    ('device', 'Device / SIM'), ('integration', 'Integration'), ('security', 'Security'), ('other', 'Other'),
]


class ItzAuditLog(models.Model):
    """Append-only activity log. Entries cannot be edited or deleted from the application."""
    _name = 'itz.audit.log'
    _description = 'ITrackZen Activity Log'
    _order = 'id desc'

    date = fields.Datetime(default=fields.Datetime.now, readonly=True, index=True)
    user_id = fields.Many2one('res.users', string='User', readonly=True, index=True)
    category = fields.Selection(AUDIT_CATEGORIES, required=True, readonly=True, index=True)
    action = fields.Char(required=True, readonly=True)
    res_model = fields.Char(readonly=True)
    res_id = fields.Integer(readonly=True)
    record_ref = fields.Char(string='Record', readonly=True)
    detail = fields.Text(readonly=True)
    ip_address = fields.Char(readonly=True)

    @api.model
    def log(self, category, action, record=None, detail=''):
        """Create a log entry. Always uses sudo so every user's actions are recorded."""
        ip = False
        try:
            from odoo.http import request
            if request and request.httprequest:
                ip = request.httprequest.remote_addr
        except Exception:  # noqa: BLE001 - never block a business action because of logging
            ip = False
        vals = {
            'category': category,
            'action': action,
            'detail': detail or '',
            'user_id': self.env.uid if self.env.uid else False,
            'ip_address': ip,
        }
        if record is not None and getattr(record, '_name', None) and len(record) == 1:
            vals.update(res_model=record._name, res_id=record.id, record_ref=record.display_name or '')
        try:
            return self.sudo().create(vals)
        except Exception:  # noqa: BLE001
            _logger.exception('Could not write ITZ audit log entry: %s', vals)
            return self.browse()

    def write(self, vals):
        raise UserError(_('Activity log entries cannot be modified.'))

    def unlink(self):
        if self.env.context.get('module_uninstall'):
            return super().unlink()
        raise UserError(_('Activity log entries cannot be deleted.'))
