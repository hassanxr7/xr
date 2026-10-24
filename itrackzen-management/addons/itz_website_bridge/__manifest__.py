{
    'name': 'ITrackZen Website Bridge',
    'version': '18.0.1.0.0',
    'summary': 'Single sign-on with the ITrackZen website admin area, role-based workspace menus, enquiries and deletion requests from the website',
    'author': 'LibDex Ltd (ITrackZen)',
    'website': 'https://itrackzen.net',
    'category': 'ITrackZen',
    'license': 'LGPL-3',
    'depends': ['itz_dashboard'],
    'data': [
        'security/ir.model.access.csv',
        'data/bridge_data.xml',
        'views/bridge_views.xml',
        'views/menus.xml',
    ],
    'installable': True,
    'application': False,
}
