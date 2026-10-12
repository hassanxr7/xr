# Employee user guide

Sign in with your e-mail and password (change the password the first time: top-right name → *Change password*). The menu shows only what your role can do.
* **Language**: the system is in **English**; press **SO** at the top for **Soomaali** (EN to go back). Your choice is saved to your account and follows you to the phone. The owner can make Somali the default for the sign-in page and new staff (*Settings → Branding → Default language*).
* **Search everything** (top bar, or press **Ctrl K** / **/**): items by name, SKU or **barcode number**, customers, sales and visits, repairs and orders. Pick a result to open it.
* **Dark mode**: the moon/sun button. On a phone the most used screens are in the bar at the bottom; **Menu** opens the rest.

## Cashier / salesperson – selling
1. **Point of sale** → pick the branch (if you have several). If your branch requires it, **Open register** first and enter the opening cash.
2. **Scan the barcode** (the cursor is already in the search box; scanners type the code and press Enter) or type a name/SKU and tap the item. Choose the right **size/colour variant**. For phones/laptops tap the item and choose the exact **serial/IMEI**.
3. Change quantity; add a **discount** per line or for the whole sale (above your limit the sale is *sent for approval* instead).
4. Pick the **customer** (leave *Walk-in* for cash sales; credit needs a customer).
5. **Payments**: *Pay full* then choose Cash / Mobile money / Bank; add a second line to split. For mobile money type the reference code. Leaving an amount unpaid creates a credit sale.
6. **Complete sale** → print the **thermal receipt** or **A4 invoice**. Stock, reports and the owner's dashboard update immediately. Double-clicking cannot create two sales.
* **Returns / exchanges**: *Sales* → open the sale → **Return** → quantities, restock yes/no, refund method. If your role cannot refund, this sends a request to the manager.
* **Collect a debt**: open the invoice → **Add payment**.
* **Close your register**: *Cash registers* → open your session → **Close register** → enter the cash you counted. A difference needs an explanation.
* **Quotation**: *Quotations* → + → pick items → print → later **Convert to sale** (prices honoured until the valid-until date).

## Price tags and barcodes (Rio Store, Reyxaan Store)
* **The system creates the barcode.** When you register an item (*Inventory → + Products* or *My shop → Register new stock*), every size/colour automatically gets its own shop barcode: an **EAN-13 in-store number** (starts with 20), the same kind of barcode used on price tags in shops and malls. A manufacturer barcode you type in yourself is kept.
* Right after saving, the system offers **Print price tags**. Choose:
  * **Tag type** – *Hang tags* on A4 card (16 per page; cut out and punch the marked hole, attach with a tag gun or string), a *hang-tag printer* (40 × 70 mm), an *A4 sticker sheet* (3 × 8) or a *sticker printer* (50 × 30 mm).
  * **Code on the tag** – *Barcode* (default, read by every shop scanner), *Barcode + QR* (adds a small QR for phone cameras) or *QR only*.
  * **How many** – *One tag per piece in stock* or a fixed number.
* A tag shows the company logo and branch, product, size · colour, the **price** (after a mark-down the old price is printed struck through and the new price in red), the barcode with its digits and the item code. The **maximum discount is never printed** – customers must not see it; staff see it when they scan.
* Reprint any time from **Price tags** (select items) or the 🏷 button in **Inventory**. Changing a price offers new tags straight away.

## Scan & sell (Rio Store, Reyxaan Store)
* **Scan**: open **Scan & sell** (on a phone the camera starts by itself; on a laptop press **📷 Start camera**). Point the camera at the tag's barcode (or QR). The item appears with its **price, stock left and maximum discount** (and the lowest price you may sell at). A USB barcode scanner or typing the code also works.
* Enter quantity and discount → **Add to basket**. A discount above the item's maximum is refused.
* **Send to manager** (sales assistants): the basket goes to the manager as an **order** (e.g. `ORD-RST-000003`). Nothing leaves stock until the manager completes it.
* **Take payment now** (cashiers and managers): takes the money and completes the sale straight away.
* **Manager – Orders**: each waiting order shows the items and total. When the customer has paid, press **✔ Payment received – complete**, choose Cash / Mobile money / Bank, confirm → the sale is created, stock goes down, the receipt can be printed. The sale is credited to the assistant who scanned it. **Cancel order** if the customer leaves.
* The camera needs **https** (the live site) and the browser's permission to use the camera. It reads EAN-13 / UPC / Code 128 barcodes and QR codes on phones and laptops. A **USB or Bluetooth barcode scanner** works everywhere (POS, Scan & sell, search box) – it types the number and presses Enter.
* **WhatsApp receipt**: after a sale (or from the sale detail) press **WhatsApp** – WhatsApp opens with the receipt text ready to send to the customer's number.

## Phone app (install on Android / iPhone)
The system installs like an app – no Play Store needed:
* **Android (Chrome)**: open the site → menu ⋮ → **Install app** / *Add to Home screen* (or the **📲 Install app** button at the top).
* **iPhone (Safari)**: open the site → Share → **Add to Home Screen**.
The icon opens the system full-screen; long-press it for shortcuts to *Scan & sell*, *Orders* and *My shop*. It is the same system with the same login, so everything scanned on the phone appears on the laptop at once.

## Manager – My shop (one-page board)
Managers land on **My shop**. It refreshes itself every 30 seconds (● Live):
* Today's sales, money collected today, this month's sales and **profit this month**; orders waiting for payment.
* **Sales – last 30 days** chart and **Best sellers this month** (pieces sold, revenue and profit per item; sales per category).
* **Running out** (at or below the minimum you set) and **Not selling – consider a discount** (in stock with little or no sales in 30 days).
* **What your stock should earn**: for every item in stock its cost, selling price, maximum discount, profit per piece, profit at the maximum discount and the expected profit; totals for the whole stock.
* **Register new stock** ("I bought these"): item name, sizes, colours, quantity, **cost per piece, selling price, maximum discount**, supplier and whether it was paid. While you type it shows the profit per piece, at the maximum discount and the total expected profit. **Save and print labels** adds the stock, records the purchase (and the supplier debt if not paid) and prints one QR label per piece.
* **Add expense** (rent, electricity, transport…) and the list of this month's expenses.
* **Statement for last month**: net sales, cost of goods sold, gross profit, staff commission, expenses and **net profit**, with **Export CSV / Excel / PDF / Print** of every item sold last month (quantity, revenue, discounts, cost, profit, margin).
* **Order soon**: items that will run out within two weeks (or are at their minimum) with sales per day, days of stock left and a **suggested quantity** (30 days of sales + minimum − on hand). **Create purchase order** turns it into an order for the supplier (receive it in *Purchases* when the goods arrive).
* **Mark down** on a slow seller: enter the new price (the item's maximum discount is suggested) → the old price is kept for the tag (struck through) and new tags are printed.
* Rio Berber's board shows customers served, the most requested services and **each barber today: customers, services, income, rate, commission and what the business keeps**.

## Barber waiting queue (Rio Berber)
* **Waiting queue** → **+ Add customer**: name, phone (optional, for WhatsApp), service and preferred barber. The customer gets a **ticket number** (starts at 1 every day) and an **estimated wait** based on today's service times and the number of barbers.
* **Start** (choose the barber) when the customer sits in the chair; **Finish & pay** confirms the service, tip and payment and **records the visit** exactly like *Barber visits* (commission included). **Left** if the customer goes away.
* **WhatsApp** on a waiting ticket sends "it is your turn" to the customer. **TV screen** shows *Now serving* and *Next* in large numbers for a screen on the wall (tap to close).

## Barber (Rio Berber)
* The **front desk** records every customer visit (**Barber visits**) and picks the barber for each service. At the end of the day the manager checks **Commissions → Daily work**.
* If you were given permission to record: **Barber visits** → tap the services (each line has *your name* preselected) → payment → **Record visit**. One customer, two services = **one visit, two services**. If several barbers work on one customer, choose the barber for each line.
* **Commissions**: your visits, services, revenue, discounts/refunds, **commission rate**, earned, payable, advances, paid, outstanding. You see only your own numbers and cannot change your rate.

## Repair technician
* **Repairs** shows the jobs assigned to you. Open a job → write the **diagnosis**, add **labour / spare-part** charges, move the status along (*Diagnosing → Awaiting approval → In progress → Completed*). You cannot start work until the front desk records the **customer's approval of the estimate**; any extra charge needs a **revision approval**. Tick **Quality check** before *Completed*. Parts you add reduce stock when the work is approved.
* **Commissions** shows your repair-labour commission.

## Front desk – repairs
**Repairs → + New repair**: customer, phone, device, serial/IMEI, fault, condition, accessories, technician, estimate, **deposit**, optional photos. Don't collect the device PIN unless essential (it is wiped when the job completes). Print the **intake slip**. Record the customer's decision (**Record customer decision**), collect the balance (**Add payment**) and set **Delivered** (needs the balance paid).

## Manager
Inventory counts and adjustments, **Transfers** (dispatch → *In transit* → receive; partial receipts allowed), **Purchases** (receive/pay/return), **Approvals**, register approval, day closing, payouts.

## If something goes wrong
* *"Insufficient stock"* – check the variant/branch; receive stock or transfer.
* *"Open a cash register session first"* – open your register.
* *"Day closed"* – ask your manager/owner to reopen the day.
* *"Approval requested"* – your manager will see it in **Approvals**.
* Errors always say what to fix; nothing is saved when an error is shown.
