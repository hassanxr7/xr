from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PlatformIdsMixin(models.AbstractModel):
    _name = 'itz.platform.ids.mixin'
    _description = 'Platform id fields'

    itz_platform_synced_at = fields.Datetime(string='Last sync with platform', readonly=True, copy=False)
    itz_platform_state = fields.Selection([('never', 'Not linked'), ('linked', 'Linked')], compute='_compute_platform_state', string='Platform link')

    def _platform_id_field(self):
        raise NotImplementedError

    def _compute_platform_state(self):
        fname = self._platform_id_field()
        for rec in self:
            rec.itz_platform_state = 'linked' if rec[fname] else 'never'

    def _check_platform_id_write(self, vals):
        fname = self._platform_id_field()
        if fname in vals and not self.env.su and not self.env.context.get('itz_platform_internal'):
            if not self.env.user.has_group('itz_base.group_itz_ops_manager'):
                raise UserError(_('Platform IDs are owned by the tracking platform. Only an operations manager can link or unlink them by hand.'))
            for rec in self:
                if rec[fname] and vals[fname] != rec[fname]:
                    self.env['itz.audit.log'].log('integration', 'Platform ID changed by hand', rec, '%s -> %s' % (rec[fname], vals[fname]))


class ResPartner(models.Model):
    _name = 'res.partner'
    _inherit = ['res.partner', 'itz.platform.ids.mixin']

    itz_platform_customer_id = fields.Char(string='Platform customer ID', copy=False, index=True)

    _sql_constraints = [('itz_platform_customer_unique', 'unique(itz_platform_customer_id)', 'This platform customer is already linked to another customer.')]

    def _platform_id_field(self):
        return 'itz_platform_customer_id'

    def write(self, vals):
        self._check_platform_id_write(vals)
        return super().write(vals)

    def _itz_link(self):
        cfg = self.env['itz.platform.config'].get_config()
        return cfg._link(cfg.customer_url_tpl, id=self.itz_platform_customer_id, email=self.email)

    def action_open_in_platform(self):
        self.ensure_one()
        url = self._itz_link()
        if not url:
            raise UserError(_('This customer is not linked to the tracking platform yet, or the customer link is not configured (Management > Configuration > Tracking Platform).'))
        return {'type': 'ir.actions.act_url', 'url': url, 'target': 'new'}


class ItzVehicle(models.Model):
    _name = 'itz.vehicle'
    _inherit = ['itz.vehicle', 'itz.platform.ids.mixin']

    itz_platform_vehicle_id = fields.Char(string='Platform vehicle ID', copy=False, index=True)

    _sql_constraints = [('itz_platform_vehicle_unique', 'unique(itz_platform_vehicle_id)', 'This platform vehicle is already linked to another vehicle.')]

    def _platform_id_field(self):
        return 'itz_platform_vehicle_id'

    def write(self, vals):
        self._check_platform_id_write(vals)
        return super().write(vals)

    def _itz_link(self, live=False):
        cfg = self.env['itz.platform.config'].get_config()
        tpl = cfg.live_map_url_tpl if live else cfg.vehicle_url_tpl
        return cfg._link(tpl, id=self.itz_platform_vehicle_id, imei=self.device_imei, plate=self.plate)

    def action_open_in_platform(self):
        self.ensure_one()
        url = self._itz_link()
        if not url:
            raise UserError(_('This vehicle is not linked to the tracking platform yet, or the vehicle link is not configured (Management > Configuration > Tracking Platform).'))
        return {'type': 'ir.actions.act_url', 'url': url, 'target': 'new'}

    def action_open_live_map(self):
        self.ensure_one()
        url = self._itz_link(live=True) or self._itz_link()
        if not url:
            raise UserError(_('The live map link is not configured (Management > Configuration > Tracking Platform).'))
        return {'type': 'ir.actions.act_url', 'url': url, 'target': 'new'}


class StockLot(models.Model):
    _name = 'stock.lot'
    _inherit = ['stock.lot', 'itz.platform.ids.mixin']

    itz_platform_device_id = fields.Char(string='Platform device ID', copy=False, index=True)

    _sql_constraints = [('itz_platform_device_unique', 'unique(itz_platform_device_id)', 'This platform device is already linked to another device.')]

    def _platform_id_field(self):
        return 'itz_platform_device_id'

    def write(self, vals):
        self._check_platform_id_write(vals)
        return super().write(vals)

    def action_open_in_platform(self):
        self.ensure_one()
        cfg = self.env['itz.platform.config'].get_config()
        url = cfg._link(cfg.device_url_tpl, id=self.itz_platform_device_id, imei=self.itz_imei)
        if not url:
            raise UserError(_('This device is not linked to the tracking platform yet, or the device link is not configured.'))
        return {'type': 'ir.actions.act_url', 'url': url, 'target': 'new'}
