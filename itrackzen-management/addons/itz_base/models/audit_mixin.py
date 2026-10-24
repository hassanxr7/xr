from odoo import api, models


class ItzAuditMixin(models.AbstractModel):
    """Logs creation, deletion and changes of selected fields into itz.audit.log.

    Models set ``_itz_audit_fields`` (list of field names) and ``_itz_audit_category``."""
    _name = 'itz.audit.mixin'
    _description = 'ITrackZen audit mixin'

    _itz_audit_fields = []
    _itz_audit_category = 'other'

    def _itz_audit_value(self, rec, fname):
        field = rec._fields[fname]
        value = rec[fname]
        if field.type == 'many2one':
            return value.display_name or ''
        if field.type in ('many2many', 'one2many'):
            return ', '.join(value.mapped('display_name'))
        if field.type == 'selection':
            return dict(field._description_selection(self.env)).get(value, value) or ''
        return '' if value is False or value is None else str(value)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        log = self.env['itz.audit.log']
        for rec in records:
            log.log(self._itz_audit_category, 'Created', rec, '')
        return records

    def write(self, vals):
        fields_to_watch = [f for f in self._itz_audit_fields if f in vals]
        before = {}
        if fields_to_watch:
            for rec in self:
                before[rec.id] = {f: self._itz_audit_value(rec, f) for f in fields_to_watch}
        res = super().write(vals)
        if fields_to_watch:
            log = self.env['itz.audit.log']
            for rec in self:
                changes = []
                for f in fields_to_watch:
                    new = self._itz_audit_value(rec, f)
                    old = before.get(rec.id, {}).get(f, '')
                    if old != new:
                        changes.append('%s: %s -> %s' % (rec._fields[f].string, old or '-', new or '-'))
                if changes:
                    log.log(self._itz_audit_category, 'Changed', rec, '\n'.join(changes))
        return res

    def unlink(self):
        log = self.env['itz.audit.log']
        for rec in self:
            log.log(self._itz_audit_category, 'Deleted', rec, '')
        return super().unlink()
