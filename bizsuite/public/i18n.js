// English is the source language; Somali strings below need review by a native speaker before go-live.
import { more } from './i18n_more.js';
import { errSo } from './i18n_err.js';
import { docsSo } from './i18n_docs.js';
import { v3 } from './i18n_v3.js';
import { v4 } from './i18n_v4.js';
const base = {
  'Sign in': 'Gal', 'Email': 'Iimayl', 'Password': 'Erayga sirta', 'Authentication code': 'Koodhka xaqiijinta', 'Sign out': 'Ka bax',
  'Dashboard': 'Dashboard-ka', 'Sales': 'Iibka', 'Point of sale': 'Goobta iibka', 'Barber visits': 'Booqashooyinka timo-jarka', 'Repairs': 'Hagaajinta', 'Inventory': 'Bakhaarka', 'Products': 'Alaabta',
  'Purchases': 'Iibsashada', 'Transfers': 'Wareejinta', 'Devices': 'Aaladaha', 'Customers': 'Macaamiisha', 'Suppliers': 'Alaab-qeybiyayaasha', 'Expenses': 'Kharashyada', 'Cash registers': 'Sanduuqyada lacagta',
  'Payments': 'Lacag-bixinta', 'Commissions': 'Boqolleyda shaqaalaha', 'Reports': 'Warbixinnada', 'Approvals': 'Ogolaanshaha', 'Staff': 'Shaqaalaha', 'Roles': 'Doorarka', 'Organisation': 'Ururka', 'Settings': 'Habaynta',
  'Audit log': 'Diiwaanka hubinta', 'Notifications': 'Ogeysiisyada', 'Language': 'Luqadda', 'Dark mode': 'Habka madow',
  'Today': 'Maanta', 'Yesterday': 'Shalay', 'This week': 'Usbuucan', 'This month': 'Bishan', 'This year': 'Sannadkan', 'Custom': 'Gaar ah', 'From': 'Laga bilaabo', 'To': 'Ilaa',
  'All businesses': 'Dhammaan ganacsiyada', 'All branches': 'Dhammaan laamaha', 'All types': 'Dhammaan noocyada', 'All employees': 'Dhammaan shaqaalaha', 'Business': 'Ganacsi', 'Branch': 'Laan', 'Employee': 'Shaqaale',
  'Net sales': 'Iibka saafiga ah', 'Repair revenue': 'Dakhliga hagaajinta', 'Collected': 'La ururiyey', 'Cost of goods sold': 'Qiimaha alaabta la iibiyey', 'Gross profit': 'Faa\'iidada guud', 'Staff commission': 'Boqolleyda shaqaalaha',
  'Operating expenses': 'Kharashyada shaqada', 'Net profit': 'Faa\'iidada saafiga ah', 'Cash': 'Lacag caddaan', 'Mobile money': 'Lacagta mobaylka', 'Bank': 'Bangi', 'Receivables': 'Lacagaha macaamiisha lagu leeyahay', 'Payables': 'Lacagaha alaab-qeybiyayaasha',
  'Inventory value': 'Qiimaha bakhaarka', 'In transit': 'Waddada ku jira', 'Low stock': 'Alaab yar', 'Out of stock': 'Alaab dhammaatay', 'Sales count': 'Tirada iibka', 'Visits': 'Booqashooyin', 'Services': 'Adeegyada', 'Repair jobs': 'Shaqooyinka hagaajinta',
  'Employee performance': 'Waxqabadka shaqaalaha', 'Branch comparison': 'Isbarbardhigga laamaha', 'Recent activity': 'Dhaqdhaqaaqii u dambeeyey', 'Pending approvals': 'Ogolaansho sugaya', 'Revenue': 'Dakhli', 'Trend': 'Isbeddel',
  'Search': 'Raadi', 'Scan barcode or type to search': 'Iskaan garee barkoodka ama qor', 'Cart': 'Gaadhiga', 'Add': 'Ku dar', 'Remove': 'Ka saar', 'Quantity': 'Tirada', 'Price': 'Qiimaha', 'Discount': 'Dhimis', 'Total': 'Wadarta', 'Subtotal': 'Wadarta hore', 'Tax': 'Canshuur',
  'Customer': 'Macmiil', 'Walk-in': 'Macmiil socda', 'Payment method': 'Habka lacag-bixinta', 'Amount': 'Qadarka', 'Reference': 'Tixraac', 'Add payment': 'Ku dar lacag-bixin', 'Complete sale': 'Dhammaystir iibka', 'Record visit': 'Diiwaangeli booqasho',
  'Barber': 'Timo-jare', 'Service': 'Adeeg', 'Tip': 'Tip', 'Balance due': 'Haraaga la bixinayo', 'Paid': 'La bixiyey', 'Unpaid': 'Aan la bixin', 'Partial': 'Qayb', 'Status': 'Xaalad', 'Date': 'Taariikh', 'Actions': 'Ficillo',
  'Scan or search to add items': 'Iskaan ama raadi si aad alaab ugu darto', 'Tap a service to add it': 'Taabo adeeg si aad ugu darto', 'Quotations': 'Qiimeyn', 'Convert to sale': 'U beddel iib', 'Mark sent': 'Calaamadi la diray', 'Mark accepted': 'Calaamadi la aqbalay', 'Valid until': 'Ansax ilaa', 'Tips': 'Tips', 'Save': 'Kaydi', 'Cancel': 'Jooji', 'Close': 'Xidh', 'Create': 'Samee', 'Edit': 'Beddel', 'Delete': 'Tirtir', 'Confirm': 'Xaqiiji', 'Approve': 'Ogolow', 'Reject': 'Diid', 'Print': 'Daabac', 'Export CSV': 'Soo saar CSV', 'Export PDF': 'Soo saar PDF',
  'Loading…': 'Waa la soo rarayaa…', 'No data yet': 'Weli xog ma jirto', 'Something went wrong': 'Wax khalad ah ayaa dhacay', 'Are you sure?': 'Ma hubtaa?', 'Previous': 'Hore', 'Next': 'Xiga', 'Page': 'Bog',
  'Return': 'Soo celin', 'Void': 'Burin', 'Receipt': 'Rasiid', 'Invoice': 'Rasiid-bixin', 'Thermal receipt': 'Rasiid yar', 'A4 invoice': 'Rasiid A4', 'Reason': 'Sabab', 'Notes': 'Qoraal',
  'Open register': 'Fur sanduuqa', 'Close register': 'Xidh sanduuqa', 'Opening cash': 'Lacagta furitaanka', 'Expected cash': 'Lacagta la filayo', 'Counted cash': 'Lacagta la tiriyey', 'Difference': 'Farqiga', 'Explanation': 'Sharaxaad',
  'Close day': 'Xidh maalinta', 'Reopen day': 'Dib u fur maalinta', 'New repair': 'Hagaajin cusub', 'Device': 'Aalad', 'Fault': 'Cilad', 'Technician': 'Farsamoyaqaan', 'Diagnosis': 'Baaritaan', 'Estimate': 'Qiyaas', 'Deposit': 'Dhigaal',
  'Received': 'La helay', 'Diagnosing': 'La baarayo', 'Awaiting approval': 'Ogolaansho sugaya', 'Awaiting parts': 'Qaybo sugaya', 'In progress': 'Socda', 'Completed': 'Dhammaaday', 'Delivered': 'La geeyey', 'Cancelled': 'La joojiyey', 'Unrepairable': 'Aan hagaajin karin',
  'Earned': 'La kasbaday', 'Payable': 'La bixin karo', 'Outstanding': 'Haraaga', 'Retained': 'Ganacsiga ku hadhay', 'Rate': 'Heerka', 'Advance': 'Hormaris', 'Deductions': 'Jaris', 'Pay out': 'Bixi',
  'Name': 'Magac', 'Phone': 'Taleefan', 'Address': 'Cinwaan', 'Role': 'Door', 'Branches': 'Laamaha', 'Active': 'Firfircoon', 'Category': 'Qeyb', 'Brand': 'Nooc', 'Size': 'Cabbir', 'Color': 'Midab', 'Stock': 'Kayd', 'Cost': 'Kharash', 'Supplier': 'Alaab-qeybiye',
  'Required field': 'Goobtan waa lagama maarmaan', 'Insufficient stock': 'Kayd ma filna', 'Not permitted': 'Lama ogola', 'Approval requested': 'Ogolaansho ayaa la codsaday', 'Saved': 'Waa la kaydiyey',
  'err.insufficient_stock': 'Kayd ma filna alaabtan', 'err.missing_permission': 'Ma haysatid fasaxa loo baahan yahay', 'err.duplicate_serial': 'Lambarkan taxanaha/IMEI hore ayaa loo diiwaangeliyey', 'err.overpayment': 'Lacagta waxay ka badan tahay qadarka la bixinayo',
  'err.day_closed': 'Maalintan waa la xidhay', 'err.register_required': 'Marka hore fur sanduuqa lacagta', 'err.invalid_credentials': 'Iimayl ama erayga sirta waa khalad', 'err.too_many_attempts': 'Isku day badan. Mar dambe isku day.',
  'err.not_found': 'Lama helin', 'err.required': 'Goobtan waa lagama maarmaan', 'err.weak_password': 'Erayga sirta waa daciif: ugu yaraan 8 xaraf oo ay ku jiraan xaraf iyo lambar', 'err.approval_pending': 'Kharashyo dheeraad ah ayaa sugaya ogolaanshaha macmiilka',
  'err.balance_due': 'Marka hore ururi haraagga lacagta', 'err.qc_required': 'Marka hore dhammaystir hubinta tayada', 'err.duplicate': 'Diiwaankan hore ayuu u jiray', 'err.invalid_integer': 'Qadarka waa inuu noqdaa tiro sax ah', 'err.invalid_amount': 'Qadarka waa khalad', 'err.nothing_to_settle': 'Wax aan la dhammaystirin ma jiro',
  'err.customer_required_for_credit': 'Macmiil socda waa inuu bixiyaa lacagta oo dhan; dooro macmiil si deyn loogu siiyo', 'err.device_unavailable': 'Aaladdan lama heli karo', 'err.module_not_available': 'Qaybtan looma furin laantan',
};
export const so = { ...base, ...more, ...errSo, ...docsSo, ...v3, ...v4 };
