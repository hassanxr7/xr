# XR Exchange — Nidaamka Sarrifka Lacagaha

Nidaam web ah oo lagu sarrifo lacagaha: **EVC Plus → MoneyGo**, **EVC Plus → USDT (TRC20 / BEP20)**, iyo **EVC Plus → PayPal**.
Wuxuu leeyahay **bayaan (statement) iyo rasiid la daabici karo** (A4, "Save as PDF"), admin panel buuxa, iyo wuxuu si toos ah ugu shaqeeyaa **Hostinger Shared Hosting** (PHP + MySQL — Node.js, Composer ama SSH looma baahna).

---

## Waxa uu qabto

**Macmiilka (customer)**
- Calculator sarrif oo toos ah: geli lacagta aad diraysid → wuxuu ku tusayaa inta aad helayso (khidmad, sicir, xad, kayd).
- Is-diiwaangelin (lambarka taleefanka + password) iyo galitaan.
- Dalab samee → wuxuu helayaa tilmaamaha lacag-bixinta EVC: lambarka lagu dirayo, lacagta, iyo **koodhka USSD** (`*712*61xxxxxxx*100#`) oo hal taabasho lagu wici karo.
- Wuxuu gelinayaa **Transaction ID**-ga SMS-ka EVC (iyo sawir screenshot ah haddii uu rabo).
- Waqti xaddidan (default 60 daqiiqo); dalabka aan la bixin si toos ah ayuu u dhacaa.
- Dashboard: dalabyadiisa, xaaladooda, iyo taariikhda dalab kasta.
- **Bayaanka xisaabta (Account Statement)** — muddo la doorto (bishan, bishii hore, 3 bilood, sannadkan, dhammaan), daabac ama PDF.
- **Rasiid** dalab kasta — daabac ama PDF.
- Raadi dalab (lambarka dalabka + taleefan).
- Luqad: **Soomaali / English**.

**Admin-ka**
- Dashboard: dalabyada sugaya hubin, lacagta maanta, khidmadda, jaantus 7 maalmood, kaydka.
- Dalabyada: shaandhee (xaalad, sarrif, taariikh, raadin), eeg sawirka caddaynta, dhammee / diid / fuli, geli TXID-ga lacag-bixinta, fariin u dir macmiilka, qoraal gudaha ah. **CSV export** (Excel).
- Sicirada & sarrifyada: beddel sicirka, khidmadda (% + go'an), xadka ugu yar/badan; ku dar sarrif cusub (tusaale USDT → EVC).
- Hababka lacag-bixinta: EVC Plus, MoneyGo, USDT TRC20, USDT BEP20, PayPal — lambarka EVC-gaaga, koodhka USSD, logo, midab, hubinta qaabka wallet-ka (regex), **kaydka (reserve)**.
- Kaydku si toos ah ayuu isu beddelaa marka dalab la dhammeeyo (ama dib loo furo).
- Macaamiisha: raadi, eeg dalabyadooda, **daabac bayaankooda**, xir/fur akoonka, beddel password-ka.
- **Warbixin la daabici karo** (Exchange Report): muddo, xaalad, sarrif — wadarta, khidmadda, sarrif kasta, iyo liiska dhaqdhaqaaqyada.
- Dejinta: magaca, logo, midabka, xiriirka, WhatsApp, ogeysiis, waqtiga dalabka, shuruudaha, qoraalka bayaanka.
- **Ogeysiis Telegram** marka dalab cusub yimaado ama macmiil bixiyo.
- Admin-yo badan.

**Amniga**: password hashing (bcrypt), CSRF token foom kasta, PDO prepared statements, xaddidaadda isku-dayga login-ka, sawirrada caddaynta oo aan si toos ah looga furi karin internetka, `.htaccess` oo xiraya `app/`, `install/schema.sql` iyo PHP ku jira `uploads/`.

---

## Shuruudaha

- PHP **8.1** ama ka sareeya (8.2 / 8.3 ayaa lagu talinayaa)
- MySQL 5.7+ ama MariaDB 10.3+
- Extensions: `pdo_mysql`, `mbstring`, `curl` (Telegram), `gd`/`fileinfo` — dhammaantood Hostinger way ku jiraan.

---

## Sida loogu rakibo Hostinger (tallaabo-tallaabo)

### 1. Diyaari faylasha
1. GitHub-ka, riix **Code → Download ZIP**, kadib furo (extract) kombiyuutarkaaga.
2. Gal galka **`exchange`**. Dooro **dhammaan** waxa ku jira (`admin`, `app`, `assets`, `install`, `uploads`, `index.php`, `.htaccess` …) kadib **Compress → ZIP** (tusaale `exchange.zip`).
   > Hubi in `.htaccess` ay ku jirto — waa fayl qarsoon. Windows: View → Show hidden items. Mac: `Cmd + Shift + .`

### 2. Samee database
1. hPanel → **Websites → Manage → Databases → MySQL Databases**.
2. Samee database cusub: geli magac (tusaale `xr`), user (tusaale `xr`) iyo password adag → **Create**.
3. Qor meel: **database name**, **username**, **password** (waxay u eg yihiin `u123456789_xr`). Host-ku waa `localhost`.

### 3. Soo geli faylasha
1. hPanel → **Files → File Manager** → fur galka **`public_html`**.
2. (Haddii ay ku jiraan faylal default ah sida `default.php`, tirtir.)
3. **Upload** → dooro `exchange.zip` → kadib midig-riix → **Extract** → `public_html` gudihiisa.
4. Hubi in `index.php`, `admin/`, `app/` … ay si toos ah ugu jiraan `public_html/` (ma aha `public_html/exchange/`).
   > Haddii aad rabto inuu ku jiro galka hoose (tusaale `domain.com/sarrif/`), waa la taageeraa — si toos ah ayuu u ogaanayaa.

### 4. Dooro nooca PHP
hPanel → **Advanced → PHP Configuration** → dooro **PHP 8.2** (ama 8.1/8.3) → Save.

### 5. Rakib
1. Browser-ka ku fur: **`https://domainkaaga.com/install/`**
2. Buuxi:
   - Xogta database-ka (tallaabada 2)
   - Magaca shirkadda, **lambarka EVC Plus** ee lacagta lagugu soo dirayo, WhatsApp
   - Akoonka admin-ka (username + password 8+ xaraf)
3. Riix **Rakib hadda (Install)**.
4. Ammaanka dartiis, **tirtir galka `install/`** (File Manager). (Installer-ku si toos ah ayuu isu xiraa, laakiin tirtiriddu waa ka wanaagsan tahay.)

### 6. SSL (HTTPS)
hPanel → **Security → SSL** → hubi in SSL-ku "Active" yahay, kadib shid **Force HTTPS**.
(Ama ka saar calaamadaha `#` ee qaybta "Force HTTPS" ee faylka `.htaccess`.)

✅ Website-ku hadda wuu shaqeynayaa: `https://domainkaaga.com` · Admin: `https://domainkaaga.com/admin/`

---

## Kadib rakibidda — dejinta muhiimka ah

1. **Admin → Hababka lacag-bixinta → EVC Plus**: hubi *"Lambarka/akoonka lacagta lagu soo diro"* (lambarkaaga EVC) iyo *Magaca akoonka*. Koodhka USSD default-ka ah: `*712*{to}*{amount}#`.
2. **Admin → Sicirada & Sarrifyada**: beddel sicirka iyo khidmadda. Xisaabta:
   - `Khidmad = lacag × % + khidmad go'an`
   - `Lacagta la helayo = (lacag − khidmad) × sicir`
   - Tusaale: EVC → USDT, sicir 1, khidmad 3% → $100 = 97.00 USDT
3. **Kaydka (reserve)**: geli inta USDT / MoneyGo / PayPal aad hayso. Dalab kasta oo ka badan kaydka lama aqbalayo.
4. **Dejinta**: logo, midabka, taleefanka, WhatsApp (tusaale `252615551234`), cinwaanka, shuruudaha, qoraalka hoose ee bayaanka.
5. **Telegram (ikhtiyaari)**: Telegram-ka ka raadi `@BotFather` → `/newbot` → koobiyee token-ka. Bot-ka fariin u dir, kadib `@userinfobot` ka hel chat ID-gaaga. Geli labadaba → *Tijaabi Telegram*.
6. **Sarrif rogan** (tusaale USDT → EVC): Admin → Sicirada → fur (active) sarrifka. Marka hore geli *akoonka lacagta lagu soo diro* ee habkaas (tusaale cinwaankaaga USDT TRC20) gudaha Hababka lacag-bixinta.

---

## Sida uu u shaqeeyo (habraaca dalabka)

```
Macmiil: samee dalab ─► Sugaya lacag-bixin ─► (wuxuu geliyay Transaction ID) ─► La hubinayo
Admin:   hubi lacagta EVC ─► Waa la fulinayaa ─► dir USDT/MoneyGo/PayPal ─► La dhammeeyay (geli TXID)
```
- Haddii macmiilku aanu bixin muddada (default 60 daqiiqo) → **Waqtigii wuu dhacay**.
- Admin-ku wuxuu kaloo dooran karaa **La diiday** (sabab waa qasab) ama **La joojiyay**.

---

## Daabacaadda (Statement / Rasiid / Warbixin)

| Dukumenti | Halka laga helo |
|---|---|
| Bayaanka macmiilka | Macmiilka: menu → **Bayaanka** · Admin: Macaamiisha → 🖨 |
| Rasiidka dalabka | Bogga dalabka → **Daabac rasiidka** |
| Warbixinta ganacsiga | Admin → **Warbixinno** (ama Dalabyada → *Daabac warbixin*) |

Riix **Daabac / PDF** → browser-ka ayaa furaya daabacaadda. PDF ahaan u kaydi: *Destination → Save as PDF*.
Talo: daabacaadda, shid **"Background graphics"** si midabada u muuqdaan.

---

## Dhibaatooyinka caadiga ah

| Dhibaato | Xal |
|---|---|
| **500 Internal Server Error** | Hubi nooca PHP (8.1+). Hubi in `.htaccess` si sax ah loo soo geliyay. |
| Bog cad / khalad aan la garanayn | Fur `app/config.php` → `'debug' => true` si aad u aragto khaladka; kadib ku celi `false`. Sidoo kale eeg `app/storage/error.log`. |
| "Database-ka lama xiriiri karo" | Hubi magaca DB, user-ka iyo password-ka (hPanel → Databases). Host-ku waa `localhost`. |
| Sawirka lama soo gelin karo | Galalka `uploads/` iyo `app/storage/` waa inay ahaadaan `755`. |
| Admin password-ka waa la ilaaway | phpMyAdmin → table `admins` → ama samee admin cusub adigoo `app/storage/installed.lock` iyo `app/config.php` tirtiraya kadibna `install/` dib u furaya (xogtaada waa la ilaalinayaa). |
| Saacadda waa khalad | Admin → Dejinta → Timezone (`Africa/Mogadishu`). |

**Kayd (backup)**: hPanel → Files → Backups, ama phpMyAdmin → Export toddobaad kasta.

---

## Qaab-dhismeedka faylasha

```
exchange/
├── index.php          Bogga hore + calculator
├── exchange.php       Samee dalab
├── order.php          Faahfaahinta dalabka + lacag-bixinta
├── account.php        Dashboard-ka macmiilka
├── statement.php      Bayaanka la daabici karo
├── receipt.php        Rasiidka la daabici karo
├── track.php          Raadi dalab
├── login.php · register.php · profile.php · logout.php · terms.php · proof.php
├── admin/             Admin panel (dashboard, orders, pairs, gateways, customers, reports, settings, admins)
├── app/               Koodka gudaha (waa la xiray — .htaccess)
│   ├── bootstrap.php · helpers.php · config.php (installer-ka ayaa sameeya)
│   ├── lang/so.php · lang/en.php
│   ├── views/         Header/footer & qaabka dukumentiyada
│   └── storage/       Sawirrada caddaynta, error.log
├── assets/            CSS, JS, sawirro
├── uploads/           Logo-yada (PHP lagama fulin karo)
└── install/           Installer (tirtir kadib rakibidda)
```

Turjumaadda waxaa laga beddeli karaa `app/lang/so.php` iyo `app/lang/en.php`.
