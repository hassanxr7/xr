import base64

from odoo import SUPERUSER_ID, api
from odoo.tools import file_open

OLD_NAMES = ('ITrackZen (LibDex Ltd)', 'ITrackZen (LibDex Ltd) ')


def migrate(cr, version):
    """Documents carry the LibDex logo and the name LibDex Merchants Ltd. Only a company still named by the old default is
    changed, so a name someone chose themselves is never overwritten."""
    env = api.Environment(cr, SUPERUSER_ID, {})
    company = env.ref('base.main_company', raise_if_not_found=False)
    if not company or company.name not in OLD_NAMES:
        return
    with file_open('itz_branding/static/img/libdex-logo.png', 'rb') as handle:
        logo = base64.b64encode(handle.read())
    vals = {'name': 'LibDex Merchants Ltd', 'logo': logo, 'primary_color': '#3aaa35', 'secondary_color': '#111111'}
    if company.country_id.code == 'US':
        vals['country_id'] = env.ref('base.ke').id
    company.write(vals)
