{
    'name': 'ITrackZen Branding',
    'version': '18.0.1.1.0',
    'summary': 'ITrackZen colors, logo, login page and document layout for the management system',
    'author': 'LibDex Ltd (ITrackZen)',
    'website': 'https://itrackzen.net',
    'category': 'ITrackZen',
    'license': 'LGPL-3',
    'depends': ['web', 'base_setup', 'mail'],
    'data': [
        'views/webclient_templates.xml',
        'views/report_templates.xml',
        'data/company_data.xml',
    ],
    'assets': {
        'web._assets_primary_variables': [
            ('prepend', 'itz_branding/static/src/scss/primary_variables.scss'),
        ],
        'web.assets_backend': [
            'itz_branding/static/src/scss/backend.scss',
            'itz_branding/static/src/js/title.js',
        ],
        'web.assets_frontend': [
            'itz_branding/static/src/scss/login.scss',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
}
