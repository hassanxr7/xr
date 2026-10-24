from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ItzEnquiry(models.Model):
    """Sales enquiries that arrive from the website contact/quote forms (or are typed in by staff)."""
    _name = 'itz.enquiry'
    _description = 'Sales enquiry'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc, id desc'

    name = fields.Char(string='Reference', copy=False, default=lambda self: _('New'), readonly=True, index=True)
    website_ref = fields.Char(string='Website reference', copy=False, index=True, readonly=True)
    enquiry_type = fields.Selection([('contact', 'Contact'), ('quote', 'Quote request'), ('demo', 'Demo request'), ('partner', 'Partnership')],
                                    default='quote', required=True)
    state = fields.Selection([('new', 'New'), ('contacted', 'Contacted'), ('quoted', 'Quotation sent'), ('won', 'Won'), ('lost', 'Lost'), ('spam', 'Spam')],
                             default='new', tracking=True, index=True)
    contact_name = fields.Char(string='Contact', required=True)
    company_name = fields.Char(string='Company')
    email = fields.Char()
    phone = fields.Char()
    country = fields.Char()
    vehicles = fields.Char(string='Number of vehicles')
    service = fields.Char(string='Interested in')
    message = fields.Text()
    user_id = fields.Many2one('res.users', string='Owner', default=lambda self: self.env.user, tracking=True)
    partner_id = fields.Many2one('res.partner', string='Customer', tracking=True)
    sale_order_id = fields.Many2one('sale.order', string='Quotation', copy=False)
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)

    _sql_constraints = [('website_ref_unique', 'unique(website_ref)', 'This website enquiry was already imported.')]

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') or vals['name'] == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('itz.enquiry') or _('New')
        records = super().create(vals_list)
        for rec in records:
            if rec.user_id and rec.user_id != self.env.user:
                rec.activity_schedule('mail.mail_activity_data_todo', user_id=rec.user_id.id,
                                      summary=_('New enquiry %s', rec.name), note=rec.message or '')
        return records

    def _find_or_create_partner(self):
        self.ensure_one()
        Partner = self.env['res.partner']
        partner = Partner
        if self.email:
            partner = Partner.search([('email', '=ilike', self.email), ('parent_id', '=', False)], limit=1)
        if not partner and self.phone:
            partner = Partner.search([('phone', '=', self.phone), ('parent_id', '=', False)], limit=1)
        if not partner:
            country = self.env['res.country'].search([('name', 'ilike', self.country)], limit=1) if self.country else False
            partner = Partner.create({
                'name': self.company_name or self.contact_name, 'is_company': bool(self.company_name),
                'email': self.email, 'phone': self.phone, 'country_id': country.id if country else False,
                'customer_rank': 1,
            })
            if self.company_name:
                Partner.create({'name': self.contact_name, 'parent_id': partner.id, 'type': 'contact', 'email': self.email, 'phone': self.phone})
        self.partner_id = partner
        return partner

    def action_create_customer(self):
        for rec in self:
            rec._find_or_create_partner()
            rec.state = 'contacted' if rec.state == 'new' else rec.state
        return True

    def action_create_quotation(self):
        self.ensure_one()
        partner = self.partner_id or self._find_or_create_partner()
        order = self.env['sale.order'].create({
            'partner_id': partner.id,
            'origin': self.name,
            'note': self.message or False,
        })
        self.write({'sale_order_id': order.id, 'state': 'quoted'})
        return {'type': 'ir.actions.act_window', 'res_model': 'sale.order', 'res_id': order.id, 'view_mode': 'form'}

    def action_set_contacted(self):
        self.write({'state': 'contacted'})

    def action_set_lost(self):
        self.write({'state': 'lost'})

    def action_set_spam(self):
        self.write({'state': 'spam'})

    def action_view_quotation(self):
        self.ensure_one()
        if not self.sale_order_id:
            raise UserError(_('No quotation yet.'))
        return {'type': 'ir.actions.act_window', 'res_model': 'sale.order', 'res_id': self.sale_order_id.id, 'view_mode': 'form'}
