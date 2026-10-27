import json
import logging
import time

from odoo import SUPERUSER_ID, api, http
from odoo.http import request

_logger = logging.getLogger(__name__)

# Dashboard tiles that the website dashboard may show, with the management-system page each one opens.
TILE_PATHS = {
    'my_tasks': 'itz_tasks.action_itz_my_tasks', 'my_overdue': 'itz_tasks.action_itz_my_tasks', 'my_jobs': 'itz_fleet.action_itz_my_jobs',
    'enq_new': 'itz_sales.action_itz_enquiries', 'quotes': 'itz_sales.action_itz_quotations', 'approvals': 'itz_sales.action_itz_approvals',
    'orders_month': 'itz_sales.action_itz_orders', 'sales_month': 'itz_sales.action_itz_orders',
    'dev_avail': 'itz_inventory.action_itz_devices', 'dev_issued': 'itz_inventory.action_itz_devices', 'dev_installed': 'itz_inventory.action_itz_devices',
    'low_stock': 'itz_inventory.action_itz_low_stock', 'inst_today': 'itz_fleet.action_itz_installations', 'inst_late': 'itz_fleet.action_itz_installations',
    'inst_active': 'itz_fleet.action_itz_installations', 'sub_active': 'itz_subscription.action_itz_subscriptions',
    'sub_due': 'itz_subscription.action_itz_renewals_due', 'sub_late': 'itz_subscription.action_itz_renewals_due',
    'sub_expired': 'itz_subscription.action_itz_subscriptions_expired', 'inv_overdue': 'itz_finance.action_itz_overdue_invoices',
    'inv_overdue_amt': 'itz_finance.action_itz_overdue_invoices', 'inv_due': 'account.action_move_out_invoice_type',
    'paid_month': 'itz_finance.action_itz_customer_payments', 'team_late': 'itz_tasks.action_itz_tasks', 'team_open': 'itz_tasks.action_itz_tasks',
    'sync_failed': 'itz_integration.action_itz_sync_jobs',
}


class ItzBridgeController(http.Controller):

    # ------------------------------------------------------------ single sign-on
    @http.route('/itz/sso/authorize', type='http', auth='user', methods=['GET'])
    def authorize(self, redirect_uri=None, state=None, **kw):
        cfg = request.env['itz.website.config'].sudo().get_config()
        if not cfg.enabled:
            return request.make_response('Single sign-on is switched off.', status=403)
        if not redirect_uri or not state or len(state) > 128 or not cfg.redirect_allowed(redirect_uri):
            return request.make_response('Invalid sign-in request.', status=400)
        user = request.env.user
        if user.share or not user.has_group('base.group_user'):
            return request.make_response('This account cannot use the staff workspace.', status=403)
        if not cfg.roles_of(user):
            return request.make_response('Your account has no ITrackZen role yet. Ask the owner to assign one.', status=403)
        token = cfg.make_login_token(user, state)
        request.env['itz.audit.log'].sudo().log('security', 'Website sign-in', user, 'Signed in to the website admin area')
        sep = '&' if '?' in redirect_uri else '?'
        return request.redirect('%s%stoken=%s&state=%s' % (redirect_uri, sep, token, state), local=False)

    @http.route('/itz/sso/logout', type='http', auth='none', methods=['GET'])
    def logout(self, redirect=None, **kw):
        cfg = request.env['itz.website.config'].sudo().get_config()
        request.session.logout(keep_db=True)
        target = redirect if (redirect and (redirect.startswith(cfg.admin_url) or redirect.startswith(cfg.website_url))) else cfg.admin_url
        return request.redirect(target, local=False)

    # ------------------------------------------------------------ server-to-server
    def _verify_signed_get(self, cfg):
        uid = request.params.get('uid', '')
        ts = request.params.get('ts', '')
        sig = request.params.get('sig', '')
        if not (uid.isdigit() and ts.isdigit()) or abs(time.time() - int(ts)) > 120:
            return None
        if not cfg.verify('summary|%s|%s' % (uid, ts), sig):
            return None
        return int(uid)

    @http.route('/itz/api/summary', type='http', auth='none', methods=['GET'], csrf=False, save_session=False)
    def summary(self, **kw):
        env = request.env(user=SUPERUSER_ID)
        cfg = env['itz.website.config'].get_config()
        if not cfg.enabled:
            return request.make_json_response({'error': 'disabled'}, status=403)
        uid = self._verify_signed_get(cfg)
        user = env['res.users'].browse(uid).exists() if uid else None
        if not user or not user.active or user.share:
            return request.make_json_response({'error': 'unauthorized'}, status=401)
        user_env = api.Environment(request.env.cr, user.id, {'lang': user.lang or 'en_US'})
        data = user_env['itz.dashboard'].get_data()
        tiles = []
        for section in data['sections']:
            for tile in section['tiles']:
                xmlid = TILE_PATHS.get(tile['key'])
                act = env.ref(xmlid, raise_if_not_found=False) if xmlid else None
                tiles.append({
                    'key': tile['key'], 'label': tile['label'], 'value': tile['value'], 'money': tile['money'], 'tone': tile['tone'],
                    'section': section['title'], 'path': ('/odoo/action-%s' % act.id) if act else None,
                })
        return request.make_json_response({
            'user': data['user'], 'roles': data['roles'], 'currency': data['currency'], 'tiles': tiles,
            'menus': cfg.menus_of(user), 'generated': int(time.time()),
        })

    @http.route('/itz/api/catalog', type='http', auth='none', methods=['GET'], csrf=False, save_session=False)
    def catalog(self, **kw):
        """Prices and stock status of the products marked "Show on the website". Signed like the dashboard summary; no personal data."""
        env = request.env(user=SUPERUSER_ID)
        cfg = env['itz.website.config'].get_config()
        if not cfg.enabled:
            return request.make_json_response({'error': 'disabled'}, status=403)
        ts = request.params.get('ts', '')
        if not ts.isdigit() or abs(time.time() - int(ts)) > 120 or not cfg.verify('catalog|%s' % ts, request.params.get('sig', '')):
            return request.make_json_response({'error': 'unauthorized'}, status=401)
        data = env['product.template'].itz_website_catalog()
        data['generated'] = int(time.time())
        return request.make_json_response(data)

    @http.route('/itz/api/catalog/image/<int:template_id>', type='http', auth='none', methods=['GET'], csrf=False, save_session=False)
    def catalog_image(self, template_id, **kw):
        """Photo of a published product (512 px). Signed like the catalog; unpublished products return 404."""
        env = request.env(user=SUPERUSER_ID)
        cfg = env['itz.website.config'].get_config()
        ts = request.params.get('ts', '')
        if not cfg.enabled or not ts.isdigit() or abs(time.time() - int(ts)) > 120 \
                or not cfg.verify('catalog-image|%s|%s' % (template_id, ts), request.params.get('sig', '')):
            return request.make_response('', status=401)
        tmpl = env['product.template'].browse(template_id).exists()
        if not tmpl or not tmpl.itz_web_publish or not tmpl.image_512:
            return request.make_response('', status=404)
        import base64
        raw = base64.b64decode(tmpl.image_512)
        mime = 'image/jpeg' if raw[:2] == b'\xff\xd8' else 'image/webp' if raw[8:12] == b'WEBP' else 'image/png'
        return request.make_response(raw, headers=[('Content-Type', mime), ('Cache-Control', 'no-store')])

    @http.route('/itz/website/event', type='http', auth='none', methods=['POST'], csrf=False, save_session=False, readonly=False)
    def event(self, **kw):
        env = request.env(user=SUPERUSER_ID)
        cfg = env['itz.website.config'].get_config()
        body = request.httprequest.get_data()
        if not cfg.accept_events or not cfg.verify(body, request.httprequest.headers.get('X-ITZ-Signature', '')):
            return request.make_json_response({'error': 'unauthorized'}, status=401)
        try:
            event = json.loads(body.decode() or '{}')
        except ValueError:
            return request.make_json_response({'error': 'invalid json'}, status=400)
        try:
            result = env['itz.website.event'].ingest(event)
        except Exception:  # noqa: BLE001 - tell the website to retry later
            _logger.exception('Website event failed: %s', event.get('id'))
            request.env.cr.rollback()
            return request.make_json_response({'error': 'processing failed'}, status=500)
        return request.make_json_response(result)
