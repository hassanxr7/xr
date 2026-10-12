// Somali translations - third batch (QR labels, scanner, manager board, orders, barber fixed fee).
// Written by the developer, NOT by a native speaker: see docs/SOMALI_REVIEW.md.
export const v3 = {
  // reports
  'Items sold: cost and profit': "Alaabta la iibiyey: kharashka iyo faa'iidada", 'Slow-moving stock (discount candidates)': 'Alaab aan si dhakhso ah u iibsamin (u baahan qiimo dhimis)', 'Stock on hand: expected profit': "Alaabta bakhaarka: faa'iidada la filayo",
  'Qty sold': 'Tirada la iibiyey', 'Profit': "Faa'iido", 'Margin %': "Faa'iido %",
  'Sold in period': 'La iibiyey mudadan', 'Last sold': 'Markii ugu dambaysay la iibiyey', 'Days without a sale': 'Maalmo aan la iibin', 'Stock value': 'Qiimaha bakhaarka', 'Suggestion': 'Talo',
  'Discount now': 'Hadda qiimo dhimis samee', 'Watch': 'La soco', 'Consider a discount': 'Ka fiirso qiimo dhimis',
  'Cost per unit': 'Kharashka halkii', 'Selling price': 'Qiimaha iibka', 'Max discount %': 'Qiimo dhimista ugu badan %', 'Profit per unit': "Faa'iidada halkii", 'Profit per unit at max discount': "Faa'iidada halkii marka qiimo dhimista ugu badan la sameeyo",
  'Expected profit (full price)': "Faa'iidada la filayo (qiimo buuxa)", 'Expected profit (max discount)': "Faa'iidada la filayo (qiimo dhimista ugu badan)",

  // UI - shop board / scanner / orders / labels / rates
  '1 label each': '1 calaamad mid kasta', '2 labels each': '2 calaamadood mid kasta', '5 labels each': '5 calaamadood mid kasta', '10 labels each': '10 calaamadood mid kasta', 'One label per piece in stock': 'Hal calaamad xabad kasta oo bakhaarka ku jirta',
  'A4 sticker sheet (3 × 8)': 'Warqad stiikar A4 (3 × 8)', 'Label printer (50 × 30 mm)': 'Daabacaha calaamadaha (50 × 30 mm)', 'Copies': 'Nuqullo', 'Paper': 'Warqad', 'Select all': 'Dooro dhammaan', 'Selected': 'La doortay', 'Select at least one item': 'Dooro ugu yaraan hal shay',
  'Add expense': 'Ku dar kharash', 'Add to basket': 'Ku dar dambiisha', 'At max discount': 'Marka qiimo dhimista ugu badan', 'at max discount': 'marka qiimo dhimista ugu badan', 'Barbers today': 'Berberrada maanta', 'Best sellers this month': 'Alaabta ugu iibka badan bishan',
  'Branch managers': 'Maamulayaasha laamaha', 'Create manager login': 'Samee akoon maamule', 'No manager login yet': 'Weli akoon maamule ma jiro',
  'Each branch manager signs in with their own account and sees only their branch: sales, stock, staff work, expenses and profit.': "Maamule kasta wuxuu ku galaa akoonkiisa gaarka ah wuxuuna arkaa laantiisa oo kaliya: iibka, bakhaarka, shaqada shaqaalaha, kharashyada iyo faa'iidada.",
  'Camera': 'Kamarad', 'Camera not available': 'Kamaraddu ma shaqaynayso', 'Camera permission was refused. Allow the camera for this site in the browser settings.': "Oggolaanshaha kamaradda waa la diiday. Ka oggolow kamaradda bogga gudaha dejinta browser-ka.",
  'Camera scanning needs https. You can still type the code or use a USB barcode scanner.': 'Iskaanka kamaraddu wuxuu u baahan yahay https. Waxaad weli qori kartaa koodka ama isticmaali kartaa iskaanka USB.',
  'The camera needs a secure (https) connection': 'Kamaraddu waxay u baahan tahay xiriir sugan (https)', 'This device has no camera access': 'Qalabkan ma laha kamarad la isticmaali karo', 'Starting camera…': 'Kamaradda ayaa la shidayaa…', 'Point the camera at the QR code': 'Kamaradda ku toosi koodka QR',
  'Start camera': 'Shid kamaradda', 'Stop camera': 'Dami kamaradda', 'Scan with camera': 'Ku iskaan kamaradda', 'Type or scan the code': 'Qor ama iskaan koodka', 'Code': 'Koodh', 'Find': 'Raadi',
  'Cancel order': 'Jooji dalabka', 'Choose the item': 'Dooro shayga', 'Commission rate history': 'Taariikhda heerka komishanka', 'Rate history': 'Taariikhda heerka',
  'Complete each order when the customer has paid.': 'Dhammaystir dalab kasta marka macmiilku lacagta bixiyo.', 'Your baskets sent to the manager.': 'Dambiisyadaada loo diray maamulaha.', 'Completed by': 'Waxaa dhammaystiray', 'Complete': 'Dhammaystir',
  'Cost per piece (what you paid)': 'Kharashka xabadkii (inta aad ku iibsatay)', 'Selling price per piece': 'Qiimaha iibka xabadkii', 'Item name': 'Magaca shayga', 'Sizes': 'Cabbirro', 'Colours': 'Midabbo', 'Quantity per size/colour': 'Tirada cabbir/midab kasta',
  'Maximum discount allowed (%)': 'Qiimo dhimista ugu badan ee la oggol yahay (%)', 'Warn me when only this many are left': 'I ogeysii marka intan oo kaliya ay hadhaan', 'Supplier': 'Alaab-qeybiye', 'New / other supplier': 'Alaab-qeybiye cusub / kale', 'New supplier name': 'Magaca alaab-qeybiyaha cusub',
  'Paid now': 'Hadda la bixiyey', 'Paid in full': 'Si buuxda ayaa loo bixiyey', 'Not paid yet (owed to supplier)': 'Weli lama bixin (dayn alaab-qeybiye)',
  'Customer name (optional)': 'Magaca macmiilka (ikhtiyaari)', 'Daily work and commissions': 'Shaqada maalinlaha ah iyo komishanka',
  'Each barber earns the percentage of the service amount plus the fixed fee for every haircut/service, never more than the amount charged. New rates apply to services recorded from now on; earlier visits keep their rate. Every change is kept in the rate history.': "Berber kasta wuxuu helaa boqolleyda qiimaha adeegga iyo lacagta go'an ee timo-jar/adeeg kasta, mana dhaafo qiimaha la qaaday. Heerarka cusub waxay khuseeyaan adeegyada hadda wixii ka dambeeya; booqashooyinkii hore heerkoodii ayay haystaan. Isbeddel kasta waxaa lagu kaydiyaa taariikhda heerka.",
  'Each label carries a QR code with the item code. Stick it on the item; scanning it with the phone or the shop camera brings up the item, its price and the maximum discount.': 'Calaamad kasta waxay leedahay koodh QR oo wata koodka shayga. Ku dheji shayga; marka lagu iskaano mobilka ama kamaradda dukaanka waxaa soo baxaya shayga, qiimihiisa iyo qiimo dhimista ugu badan.',
  'Everything is selling': 'Wax walba waa la iibinayaa', 'Nothing is running out': 'Waxba ma dhammaanayaan', 'Expected profit': "Faa'iidada la filayo", 'Expected sales': 'Iibka la filayo', 'Expenses this month': 'Kharashyada bishan', 'No expenses this month': 'Bishan kharash ma jiro',
  'Fixed fee per service': "Lacag go'an adeeg kasta", 'Rates per barber': 'Heerarka berber kasta', 'Example': 'Tusaale', 'per service': 'adeeg kasta',
  'Full list': 'Liiska oo dhan', 'In stock, little or no sales in the last 30 days': 'Bakhaarka way ku jiraan, iib yar ama iib la’aan 30-kii maalmood ee la soo dhaafay', 'Install app': 'Ku rakib app-ka',
  'Items sold last month': 'Alaabta la iibiyey bishii hore', 'Maximum discount': 'Qiimo dhimista ugu badan', 'max discount': 'qiimo dhimista ugu badan', 'No discount limit set': 'Xad qiimo dhimis lama dhigin', 'lowest price': 'qiimaha ugu hooseeya',
  'Most requested services this month': 'Adeegyada ugu badan ee la codsaday bishan', 'My shop': 'Dukaankayga', 'No item found for this code': 'Shay laguma helin koodkan', 'No orders are waiting': 'Dalab sugaya ma jiro', 'No sales yet': 'Weli iib ma jiro',
  'Not selling - consider a discount': 'Aan la iibin - ka fiirso qiimo dhimis', 'Orders': 'Dalabaadka', 'Orders waiting': 'Dalabaad sugaya', 'Orders waiting for payment': 'Dalabaad sugaya lacag bixin', 'Waiting for payment': 'Sugaya lacag bixin', 'Payment received - complete': 'Lacagta waa la helay - dhammaystir',
  'Print QR labels': 'Daabac calaamadaha QR', 'Print labels': 'Daabac calaamadaha', 'Profit per piece': "Faa'iidada xabadkii", 'Record a visit': 'Diiwaangeli booqasho', 'Register new stock': 'Diiwaangeli alaab cusub', 'Running out': 'Kuwa dhammaanaya', 'Sale completed': 'Iibka waa la dhammaystiray',
  'Sales - last 30 days': 'Iibka - 30-kii maalmood ee la soo dhaafay', 'Save and print labels': 'Kaydi oo daabac calaamadaha', 'Scan & sell': 'Iskaan oo iibi', 'Send to manager': 'U dir maamulaha', 'Sent to the manager': 'Waxaa loo diray maamulaha',
  'Serialized devices are sold from the Point of sale': 'Qalabka leh lambarka taxanaha waxaa laga iibiyaa Goobta iibka', 'Statement for last month': 'Warbixinta bishii hore', 'Stock registered': 'Alaabta waa la diiwaangeliyey', 'Take payment now': 'Hadda qaado lacagta',
  'Tax is added when the sale is completed': 'Canshuurta waxaa lagu daraa marka iibka la dhammaystiro', 'The manager completes the sale when the customer pays.': 'Maamulaha ayaa dhammaystira iibka marka macmiilku bixiyo.', 'Total cost': 'Kharashka guud',
  'What was it for?': 'Maxaa loo isticmaalay?', 'What your stock should earn': "Faa'iidada alaabtaada bakhaarka laga filayo", 'days without a sale': 'maalmood iib la’aan', 'in stock': 'bakhaarka ku jira',
  // values passed through helpers (not found by the audit)
  "Today's sales": 'Iibka maanta', 'Collected today': 'Lacagta maanta la qaaday', 'This month': 'Bishan', 'Profit this month': "Faa'iidada bishan", 'Pieces in stock': 'Xabadaha bakhaarka', 'Stock cost': 'Kharashka bakhaarka', 'Value at selling price': 'Qiimaha marka la iibiyo',
  'Pieces': 'Xabado', 'pieces': 'xabbo', 'pcs': 'xabbo', 'left': 'hadhay', 'sold': 'la iibiyey', 'Only': 'Kaliya', 'Added': 'Waa lagu daray', 'Basket': 'Dambiisha', 'Clear': 'Nadiifi', 'Live': 'Toos', 'sizes/colours': 'cabbir/midab',
  'Sell': 'Iib', 'People': 'Dadka', 'Money': 'Lacagta', 'Admin': 'Maamul', // menu group headings
  'Approved': 'La oggolaaday', 'OK': 'Hagaag', 'All': 'Dhammaan', 'Rent': 'Kiro', 'Electricity': 'Koronto', 'Salaries': 'Mushaharaad', 'Supplies': 'Agab', 'Transport': 'Gaadiid', 'Marketing': 'Suuqgeyn', 'Maintenance': 'Dayactir', 'Other': 'Kale',
  'Revenue': 'Dakhli', 'Sales Assistant': 'Kaaliyaha iibka', 'Profit': "Faa'iido",
  // labels
  'Max discount': 'Qiimo dhimista ugu badan', 'labels': 'calaamadood', 'QR labels': 'Calaamadaha QR',
  // server errors
  'err.discount_above_item_max': 'Qiimo dhimistu waxay ka badan tahay inta loo oggol yahay shaygan', 'err.order_discount_limit': 'Qiimo dhimista dalabkan waa ka badan tahay xadkaaga; milkiilaha ha dhammaystiro ama qiimo dhimista yaree',
  'err.order_closed': 'Dalabkan horey ayaa loo dhammaystiray ama waa la joojiyey', 'err.text_required': 'Wax la koodeeyo ma jiraan', 'err.too_many_lines': 'Shay aad u badan ayaa hal dalab ku jira', 'err.no_branch': 'Laan laguuma xilsaarin',
  'err.price_below_cost': 'Qiimaha iibku wuu ka hooseeyaa kharashka', 'err.insufficient_stock': 'Alaabta bakhaarka kuma filna',
};
