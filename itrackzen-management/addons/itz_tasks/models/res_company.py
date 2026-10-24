from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    itz_collection_tasks = fields.Boolean(string='Create collection tasks for overdue invoices', default=True)
    itz_collection_days = fields.Integer(string='Create a collection task after (days overdue)', default=3)
