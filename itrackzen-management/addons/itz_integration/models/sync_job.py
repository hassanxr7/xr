import hashlib
import json
import logging
from datetime import timedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError

from .adapters import AdapterError

_logger = logging.getLogger(__name__)

OPERATIONS = [
    ('customer', 'Customer'), ('vehicle', 'Vehicle'), ('device', 'Device'), ('service', 'Service status'),
]


class ItzSyncJob(models.Model):
    """Outgoing change waiting to be sent to the tracking platform (queue with retry and idempotency)."""
    _name = 'itz.sync.job'
    _description = 'Platform sync job'
    _order = 'id desc'

    name = fields.Char(compute='_compute_name', store=True)
    operation = fields.Selection(OPERATIONS, required=True, index=True)
    res_model = fields.Char(required=True)
    res_id = fields.Integer(required=True, index=True)
    record_name = fields.Char()
    payload = fields.Text()
    idempotency_key = fields.Char(required=True, index=True, copy=False)
    state = fields.Selection([
        ('pending', 'Waiting'), ('done', 'Sent'), ('dry_run', 'Dry run (not sent)'), ('simulated', 'Simulated'),
        ('failed', 'Failed'), ('skipped', 'Skipped')], default='pending', index=True)
    attempts = fields.Integer(default=0)
    next_try = fields.Datetime(default=fields.Datetime.now, index=True)
    last_error = fields.Text()
    response = fields.Text()
    sent_at = fields.Datetime()
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True, index=True)

    _sql_constraints = [('idem_unique', 'unique(idempotency_key)', 'This change was already queued.')]

    @api.depends('operation', 'record_name')
    def _compute_name(self):
        for job in self:
            job.name = '%s: %s' % (dict(OPERATIONS).get(job.operation, job.operation), job.record_name or job.res_id)

    # ---------------------------------------------------------------- enqueue
    @api.model
    def enqueue(self, operation, record, payload):
        """Queue a change. Identical payload for the same record is queued only once."""
        cfg = self.env['itz.platform.config'].get_config(record.company_id if 'company_id' in record._fields and record.company_id else None)
        if cfg.mode == 'disabled':
            return self.browse()
        if not {'customer': cfg.sync_customers, 'vehicle': cfg.sync_vehicles, 'device': cfg.sync_devices, 'service': cfg.sync_service}[operation]:
            return self.browse()
        body = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(body.encode()).hexdigest()[:24]
        key = '%s:%s:%s:%s' % (operation, record._name, record.id, digest)
        existing = self.sudo().search([('idempotency_key', '=', key)], limit=1)
        if existing:
            return existing
        return self.sudo().create({
            'operation': operation, 'res_model': record._name, 'res_id': record.id, 'record_name': record.display_name,
            'payload': body, 'idempotency_key': key, 'company_id': cfg.company_id.id,
        })

    # ---------------------------------------------------------------- process
    @api.model
    def _cron_process(self, limit=100):
        jobs = self.sudo().search([('state', '=', 'pending'), ('next_try', '<=', fields.Datetime.now())], order='id', limit=limit)
        jobs.process()
        return True

    def process(self):
        for job in self:
            if job.state != 'pending':
                continue
            try:
                with self.env.cr.savepoint():
                    job._process_one()
            except Exception as exc:  # noqa: BLE001 - never let one job block the queue
                _logger.exception('Sync job %s crashed', job.id)
                job._register_failure(str(exc), retry=True)

    def _process_one(self):
        cfg = self.env['itz.platform.config'].get_config(self.company_id)
        record = self.env[self.res_model].sudo().browse(self.res_id).exists()
        if not record:
            self.write({'state': 'skipped', 'last_error': _('The record no longer exists.')})
            return
        # Always send the CURRENT data of the record, not what it looked like when it was queued
        payload = self._build_payload(record, cfg)
        if payload is None:
            self.write({'state': 'skipped', 'last_error': _('Nothing to send yet (waiting for parent records).')})
            return
        endpoint = {'customer': cfg.ep_customer, 'vehicle': cfg.ep_vehicle, 'device': cfg.ep_device, 'service': cfg.ep_service}[self.operation]
        if cfg.mode == 'disabled':
            self.write({'state': 'skipped', 'last_error': _('Integration is disabled.')})
            return
        if cfg.mode == 'dry_run':
            self.write({'state': 'dry_run', 'payload': json.dumps(payload, sort_keys=True, default=str, indent=2),
                        'response': _('DRY RUN. Would POST to %(ep)s', ep=endpoint), 'attempts': self.attempts + 1})
            return
        adapter = self.env['itz.platform.adapter'].adapter_for(cfg)
        try:
            response = adapter.send(endpoint, payload, self.idempotency_key)
        except AdapterError as exc:
            self._register_failure(str(exc), retry=exc.retry, cfg=cfg)
            return
        self._apply_response(record, response)
        self.write({
            'state': 'simulated' if cfg.mode == 'mock' else 'done', 'sent_at': fields.Datetime.now(),
            'payload': json.dumps(payload, sort_keys=True, default=str, indent=2),
            'response': json.dumps(response, default=str)[:2000], 'attempts': self.attempts + 1, 'last_error': False,
        })
        if cfg.mode == 'live':
            cfg.sudo().write({'last_ok': fields.Datetime.now(), 'last_error': False})

    def _register_failure(self, message, retry=True, cfg=None):
        self.ensure_one()
        cfg = cfg or self.env['itz.platform.config'].get_config(self.company_id)
        attempts = self.attempts + 1
        if not retry or attempts >= (cfg.max_attempts or 8):
            self.write({'state': 'failed', 'attempts': attempts, 'last_error': message})
            self.env['itz.audit.log'].log('integration', 'Sync failed', None, '%s: %s' % (self.name, message))
            cfg.sudo().write({'last_error': message})
            admin = self.env.ref('base.user_admin')
            self.env['itz.task'].sudo().create({
                'name': _('Platform sync failed: %s', self.name), 'task_type': 'admin', 'assigned_user_id': admin.id, 'priority': '2',
                'description': '<p>%s</p>' % message,
            })
        else:
            delay = min(2 ** attempts * 60, 6 * 3600)
            self.write({'attempts': attempts, 'last_error': message, 'next_try': fields.Datetime.now() + timedelta(seconds=delay)})

    def action_retry(self):
        self.filtered(lambda j: j.state in ('failed', 'skipped', 'dry_run', 'simulated')).write(
            {'state': 'pending', 'attempts': 0, 'next_try': fields.Datetime.now(), 'last_error': False})
        return True

    def action_process_now(self):
        self.filtered(lambda j: j.state == 'pending').process()
        return True

    # ---------------------------------------------------------------- payloads
    def _build_payload(self, record, cfg):
        """Payload contract version 1 (documented in docs/integration-contract.md)."""
        op = self.operation
        if op == 'customer':
            return {
                'version': 1, 'external_id': 'cus-%s' % record.id, 'platform_id': record.itz_platform_customer_id or None,
                'name': record.name, 'company': record.parent_id.name if record.parent_id else (record.name if record.is_company else None),
                'email': record.email or None, 'phone': record.phone or None, 'country': record.country_id.code or None,
            }
        if op == 'vehicle':
            customer = record.partner_id
            if not customer.itz_platform_customer_id and cfg.sync_customers and cfg.mode == 'live':
                self._ensure_parent(customer, 'customer')
            return {
                'version': 1, 'external_id': 'veh-%s' % record.id, 'platform_id': record.itz_platform_vehicle_id or None,
                'customer_id': customer.itz_platform_customer_id or None, 'customer_external_id': 'cus-%s' % customer.id,
                'plate': record.plate, 'make': record.make or None, 'model': record.model or None, 'year': record.year or None,
                'type': record.vehicle_type, 'vin': record.vin or None, 'active': record.active,
            }
        if op == 'device':
            vehicle = record.itz_vehicle_id
            sim = record.itz_sim_lot_id
            return {
                'version': 1, 'external_id': 'dev-%s' % record.id, 'platform_id': record.itz_platform_device_id or None,
                'imei': record.itz_imei or record.name, 'serial': record.name, 'model': record.product_id.display_name,
                'vehicle_id': vehicle.itz_platform_vehicle_id or None, 'vehicle_external_id': ('veh-%s' % vehicle.id) if vehicle else None,
                'plate': vehicle.plate if vehicle else None,
                'customer_id': vehicle.partner_id.itz_platform_customer_id or None if vehicle else None,
                'sim': {'iccid': sim.name, 'msisdn': sim.itz_msisdn or None, 'carrier': sim.itz_carrier or None, 'apn': sim.itz_apn or None} if sim else None,
                'status': record.itz_state,
            }
        if op == 'service':
            vehicle = record.vehicle_id
            device = vehicle.device_id
            return {
                'version': 1, 'external_id': 'sub-%s' % record.id,
                'vehicle_id': vehicle.itz_platform_vehicle_id or None, 'vehicle_external_id': 'veh-%s' % vehicle.id, 'plate': vehicle.plate,
                'device_imei': device.itz_imei if device else None, 'plan': record.plan_id.display_name,
                'status': record.state, 'expires_on': fields.Date.to_string(record.next_renewal_date) if record.next_renewal_date else None,
                'payment_status': record.payment_status,
            }
        return None

    def _ensure_parent(self, record, operation):
        """Make sure the parent record has a platform id before the child is sent."""
        job = self.enqueue(operation, record, {'ensure': True, 'at': str(record.write_date)})
        if job and job.state == 'pending':
            job._process_one()

    def _apply_response(self, record, response):
        """Store the platform ID returned by the platform (the platform owns its own IDs)."""
        platform_id = (response or {}).get('id') or (response or {}).get('platform_id')
        if not platform_id:
            return
        field = {'customer': 'itz_platform_customer_id', 'vehicle': 'itz_platform_vehicle_id', 'device': 'itz_platform_device_id'}.get(self.operation)
        if field and getattr(record, field, False) != str(platform_id):
            record.with_context(itz_platform_internal=True).write({field: str(platform_id), 'itz_platform_synced_at': fields.Datetime.now()})
