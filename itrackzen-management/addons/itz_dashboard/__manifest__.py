{
    'name': 'ITrackZen Dashboard and Reports',
    'version': '18.0.1.0.0',
    'summary': 'Role-based home dashboard, global search, reports with PDF and Excel export',
    'author': 'LibDex Ltd (ITrackZen)',
    'website': 'https://itrackzen.net',
    'category': 'ITrackZen',
    'license': 'LGPL-3',
    'depends': ['itz_integration', 'web'],
    'data': [
        'security/ir.model.access.csv',
        'report/report_templates.xml',
        'wizard/report_wizard_views.xml',
        'views/dashboard_views.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'itz_dashboard/static/src/scss/dashboard.scss',
            'itz_dashboard/static/src/js/dashboard.js',
            'itz_dashboard/static/src/xml/dashboard.xml',
        ],
    },
    'installable': True,
    'application': False,
}
