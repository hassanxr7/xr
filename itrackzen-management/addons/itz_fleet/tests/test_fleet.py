from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import tagged
from odoo.addons.itz_inventory.tests.common import ItzCommon


@tagged('post_install', '-at_install', 'itz')
class TestFleet(ItzCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.customer = cls.env['res.partner'].create({'name': 'Acme Logistics', 'phone': '+254700111222', 'is_company': True})
        cls.other_customer = cls.env['res.partner'].create({'name': 'Other Co', 'phone': '+254700999888', 'is_company': True})
        cls.vehicle = cls.env['itz.vehicle'].create({'plate': 'KDA 123A', 'partner_id': cls.customer.id, 'make': 'Isuzu', 'model': 'NPR'})
        cls.other_vehicle = cls.env['itz.vehicle'].create({'plate': 'KBB 777B', 'partner_id': cls.other_customer.id})

    def _stock_device(self, imei='356307042441013', sim='8925401000000000011', issue_to=None, msisdn='+254711000111'):
        self.receive(self.tracker, [imei])
        self.receive(self.sim, [sim])
        dev = self.env['stock.lot'].search([('itz_imei', '=', imei)])
        simlot = self.env['stock.lot'].search([('name', '=', sim), ('product_id', '=', self.sim.id)])
        simlot.itz_msisdn = msisdn
        if issue_to:
            self.env['itz.issue.technician'].with_user(self.users['store']).create({
                'technician_id': issue_to.id,
                'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': dev.id, 'quantity': 1}),
                             (0, 0, {'product_id': self.sim.id, 'lot_id': simlot.id, 'quantity': 1})]}).action_confirm()
        return dev, simlot

    def _job(self, dev, simlot, tech, vehicle=None, **kw):
        vehicle = vehicle or self.vehicle
        vals = {
            'partner_id': vehicle.partner_id.id, 'vehicle_id': vehicle.id, 'technician_id': tech.id,
            'date_planned': fields.Datetime.now(), 'customer_confirmed_by': 'Mr Driver',
            'line_ids': [(0, 0, {'action': 'install', 'product_id': self.tracker.id, 'lot_id': dev.id, 'sim_lot_id': simlot.id})],
        }
        vals.update(kw)
        return self.env['itz.installation'].with_user(self.users['ops']).create(vals)

    def test_01_plate_unique_and_search(self):
        with self.assertRaises(Exception):
            self.env['itz.vehicle'].create({'plate': 'kda-123a', 'partner_id': self.customer.id})
        res = self.env['itz.vehicle'].name_search('kda123')
        self.assertTrue(res and res[0][0] == self.vehicle.id)

    def test_02_full_installation_flow(self):
        tech = self.users['tech']
        dev, simlot = self._stock_device(issue_to=tech)
        job = self._job(dev, simlot, tech)
        job.action_schedule()
        self.assertEqual(job.state, 'scheduled')
        job.with_user(tech).action_start()
        self.assertEqual(job.state, 'in_progress')
        job.with_user(tech).action_done()
        self.assertEqual(job.state, 'done')
        dev.invalidate_recordset()
        self.assertEqual(dev.itz_state, 'installed')
        self.assertEqual(dev.itz_vehicle_id, self.vehicle)
        self.assertEqual(dev.itz_sim_lot_id, simlot)
        self.assertEqual(simlot.itz_state, 'installed')
        self.assertEqual(self.vehicle.device_id, dev)
        self.assertEqual(self.vehicle.state, 'equipped')
        self.assertEqual(self.vehicle.sim_number, '+254711000111')
        self.assertTrue(dev.itz_warranty_end)
        self.assertEqual(job.warranty_months, 12)
        # stock moved out of technician location to customer
        self.assertEqual(dev.itz_location_id, self.env.ref('stock.stock_location_customers'))
        self.assertTrue(job.picking_ids)
        ev = self.env['itz.device.event'].search([('lot_id', '=', dev.id), ('event_type', '=', 'install')])
        self.assertTrue(ev and ev.vehicle_id == self.vehicle)
        # cannot complete twice
        with self.assertRaises(UserError):
            job.action_done()

    def test_03_cannot_install_unissued_equipment(self):
        tech = self.users['tech']
        dev, simlot = self._stock_device()
        job = self._job(dev, simlot, tech)
        job.action_schedule()
        with self.assertRaises(UserError):
            job.with_user(tech).action_done()
        self.assertEqual(dev.itz_state, 'available')

    def test_04_customer_confirmation_required(self):
        tech = self.users['tech']
        dev, simlot = self._stock_device(issue_to=tech)
        job = self._job(dev, simlot, tech, customer_confirmed_by=False)
        job.action_schedule()
        with self.assertRaises(UserError):
            job.with_user(tech).action_done()
        job.with_user(tech).write({'customer_confirmed_by': 'Mary'})
        job.with_user(tech).action_done()
        self.assertEqual(job.state, 'done')

    def test_05_technician_isolation(self):
        t1, t2 = self.users['tech'], self.users['tech2']
        dev, simlot = self._stock_device(issue_to=t1)
        job1 = self._job(dev, simlot, t1)
        job1.action_schedule()
        dev2, sim2 = self._stock_device('356307042441021', '8925401000000000029', issue_to=t2, msisdn='+254711000222')
        job2 = self._job(dev2, sim2, t2, vehicle=self.other_vehicle)
        job2.action_schedule()
        Install = self.env['itz.installation']
        self.assertEqual(Install.with_user(t1).search([]), job1)
        self.assertEqual(Install.with_user(t2).search([]), job2)
        self.assertEqual(self.env['itz.vehicle'].with_user(t1).search([]), self.vehicle)
        with self.assertRaises(AccessError):
            job2.with_user(t1).read(['name'])
        partners = self.env['res.partner'].with_user(t1).search([('is_company', '=', True), ('name', 'in', ['Acme Logistics', 'Other Co'])])
        self.assertEqual(partners, self.customer)
        # technician cannot reassign or change customer
        with self.assertRaises(UserError):
            job1.with_user(t1).write({'technician_id': t2.id})
        # support/ops see all
        self.assertEqual(len(Install.with_user(self.users['support']).search([])), 2)

    def test_06_replacement_and_removal_history(self):
        tech = self.users['tech']
        dev, simlot = self._stock_device(issue_to=tech)
        job = self._job(dev, simlot, tech)
        job.action_schedule(); job.with_user(tech).action_done()
        # replace faulty device with a new one, keep SIM
        self.receive(self.tracker, ['356307042441039'])
        new = self.env['stock.lot'].search([('itz_imei', '=', '356307042441039')])
        self.env['itz.issue.technician'].with_user(self.users['store']).create({
            'technician_id': tech.id, 'line_ids': [(0, 0, {'product_id': self.tracker.id, 'lot_id': new.id, 'quantity': 1})]}).action_confirm()
        rep = self.env['itz.installation'].with_user(self.users['ops']).create({
            'job_type': 'replace', 'partner_id': self.customer.id, 'vehicle_id': self.vehicle.id, 'technician_id': tech.id,
            'date_planned': fields.Datetime.now(), 'customer_confirmed_by': 'Mr Driver',
            'line_ids': [(0, 0, {'action': 'remove', 'product_id': self.tracker.id, 'lot_id': dev.id}),
                         (0, 0, {'action': 'install', 'product_id': self.tracker.id, 'lot_id': new.id})]})
        rep.action_schedule(); rep.with_user(tech).action_done()
        dev.invalidate_recordset(); self.vehicle.invalidate_recordset()
        self.assertFalse(dev.itz_vehicle_id)
        self.assertEqual(dev.itz_state, 'returned')
        self.assertEqual(self.vehicle.device_id, new)
        types = self.env['itz.device.event'].search([('vehicle_id', '=', self.vehicle.id)]).mapped('event_type')
        self.assertIn('remove', types)
        self.assertIn('replace', types)
        # the old device now sits in the technician's hands, can be returned to store
        self.assertEqual(dev.itz_technician_user_id, tech)

    def test_07_search_by_phone_and_imei(self):
        dev, simlot = self._stock_device(issue_to=self.users['tech'])
        job = self._job(dev, simlot, self.users['tech'])
        job.action_schedule(); job.with_user(self.users['tech']).action_done()
        V = self.env['itz.vehicle']
        self.assertEqual(V.search([('device_ids.itz_imei', 'ilike', '356307042441013')]), self.vehicle)
        self.assertEqual(V.search([('partner_id.phone', 'ilike', '700111222')]), self.vehicle)
        P = self.env['res.partner']
        self.assertEqual(P.search([('itz_search_plates', 'ilike', '356307042441013')]), self.customer)
        self.assertEqual(self.customer.itz_installation_count, 1)

    def test_08_vehicle_owner_mismatch_blocked(self):
        with self.assertRaises(ValidationError):
            self.env['itz.installation'].create({
                'partner_id': self.other_customer.id, 'vehicle_id': self.vehicle.id,
                'line_ids': [(0, 0, {'action': 'install', 'product_id': self.tracker.id})]})

    def test_09_stock_changes_are_audited(self):
        tech = self.users['tech']
        dev, simlot = self._stock_device(issue_to=tech)
        logs = self.env['itz.audit.log'].search([('category', '=', 'stock')])
        self.assertTrue(logs)
        self.assertTrue(self.env['itz.audit.log'].search([('action', '=', 'Equipment issued')]))
