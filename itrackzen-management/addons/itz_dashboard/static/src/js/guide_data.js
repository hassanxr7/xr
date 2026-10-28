/** @odoo-module **/
// Tutorials shown in Management > Guide. Every text has an English and a Somali version; the reader switches with one button.
export const UI = {
    en: { title: "Guide", subtitle: "Short step-by-step lessons with pictures. Pick a topic on the left.", topics: "Topics", tip: "Tip", steps: "Steps", search: "Search the guide...", none: "No lesson matches.", lang: "Somali", next: "Next lesson", back: "Back to the dashboard" },
    so: { title: "Hagaha", subtitle: "Casharro gaaban oo tallaabo-tallaabo ah oo sawiro leh. Dooro mawduuc dhinaca bidix.", topics: "Mawduucyada", tip: "Talo", steps: "Tallaabooyin", search: "Ka raadi hagaha...", none: "Cashar ma jiro.", lang: "English", next: "Casharka xiga", back: "Ku noqo dashboard-ka" },
};

export const GUIDE = [
    {
        id: "dashboard", icon: "fa-tachometer", img: "g-dashboard.png",
        title: { en: "Your dashboard", so: "Dashboard-kaaga" },
        intro: { en: "The dashboard is your starting page. It shows what needs you today, in plain words.", so: "Dashboard-ku waa bogga aad ka bilowdo. Wuxuu ku tusaa waxa maanta kuu baahan, erayo fudud." },
        steps: [
            { en: "The big cards at the top are your key numbers. Click a card to open the list behind it. The small line shows the last 7 days.", so: "Kaararka waaweyn ee kore waa tirooyinkaaga ugu muhiimsan. Riix kaar si aad u furto liiska ka danbeeya. Xariiqda yar waxay muujisaa 7-dii maalmood ee la soo dhaafay." },
            { en: "The search box finds a customer, plate, phone number, IMEI or serial. Press the / key to jump into it.", so: "Sanduuqa raadinta wuxuu helaa macmiil, taarikada gaariga, lambarka taleefanka, IMEI ama serial. Riix furaha / si aad u gasho." },
            { en: "Start here: big buttons for the jobs you do most. They change with your role.", so: "Start here: badhamo waaweyn oo ah shaqooyinka aad inta badan qabato. Waxay ku xiran yihiin doorkaaga." },
            { en: "Needs your attention: only things that are late or waiting for you. Red is urgent. If it says all caught up, you are done.", so: "Needs your attention: kaliya waxyaabaha daahay ama ku sugaya. Cas waa degdeg. Haddii ay tiraahdo 'all caught up', waad dhammaysay." },
            { en: "Team online (managers and owners): who is online now, and how long each person was active today and this week.", so: "Team online (maamulayaasha iyo milkiilayaasha): yaa hadda online ah, iyo intii saac ee qof kasta u shaqeeyay maanta iyo toddobaadkan." },
            { en: "The page refreshes by itself every minute. Use the moon button at the top to switch dark and light mode.", so: "Bogga wuu is cusboonaysiiyaa daqiiqad kasta. Isticmaal badhanka dayaxa ee sare si aad ugu beddesho dark iyo light mode." },
        ],
        tip: { en: "If a card shows nothing, you do not have that feature in your role. That is normal.", so: "Haddii kaar uusan waxba muujin, doorkaaga kuma jirto sifadaas. Taasi waa caadi." },
    },
    {
        id: "search", icon: "fa-search", img: "g-search.png",
        title: { en: "Find anything fast", so: "Wax kasta si degdeg ah u hel" },
        intro: { en: "One search box finds customers, vehicles, trackers, SIM cards, installations and subscriptions.", so: "Hal sanduuq raadin ayaa helaya macaamiil, gaadiid, trackers, SIM cards, rakibaad iyo rukun." },
        steps: [
            { en: "On the dashboard, click the search box (or press /).", so: "Dashboard-ka, riix sanduuqa raadinta (ama riix /)." },
            { en: "Type at least 2 letters or digits: a name, a plate such as KDA 123A, a phone number, an IMEI or a serial number.", so: "Ku qor ugu yaraan 2 xaraf ama tiro: magac, taarikada sida KDA 123A, lambar taleefan, IMEI ama serial." },
            { en: "Results are grouped: Vehicles, Customers, Devices and SIM cards, Installations, Subscriptions. Click one to open it.", so: "Natiijooyinku waa kooxo: Vehicles, Customers, Devices and SIM cards, Installations, Subscriptions. Riix mid si aad u furto." },
        ],
        tip: { en: "You only see results you are allowed to see. A technician sees only their own jobs.", so: "Waxaad arkaysaa oo keliya natiijooyinka laguu ogolyahay. Farsamoyaqaanku wuxuu arkaa shaqooyinkiisa oo keliya." },
    },
    {
        id: "customer", icon: "fa-user-plus", img: "g-new-customer.png",
        title: { en: "Register a new customer or company", so: "Diiwaangeli macmiil ama shirkad cusub" },
        intro: { en: "Always search first so you do not create the same customer twice.", so: "Marwalba marka hore raadi si aadan labo jeer u abuurin isla macmiilka." },
        steps: [
            { en: "Search the name or phone number on the dashboard. If the customer exists, open it and stop here.", so: "Dashboard-ka ka raadi magaca ama lambarka taleefanka. Haddii macmiilku jiro, fur oo halkan jooji." },
            { en: "Go to Customers > Customers and press New (or use the Add a customer button on the dashboard).", so: "Tag Customers > Customers oo riix New (ama isticmaal badhanka Add a customer ee dashboard-ka)." },
            { en: "Choose Company for a business or Individual for a person. Type the full name exactly as it should be on invoices.", so: "Dooro Company haddii ay tahay ganacsi ama Individual haddii ay tahay qof. Ku qor magaca oo dhan sida loogu baahan yahay invoice-ka." },
            { en: "Fill in Phone, Email and Country. The phone and email are used for renewal reminders and statements.", so: "Buuxi Phone, Email iyo Country. Taleefanka iyo email-ka waxaa loo isticmaalaa xusuusinta cusboonaysiinta iyo statements." },
            { en: "For a company, add the contact person under the Contacts and Addresses tab (name, phone, email).", so: "Haddii ay tahay shirkad, ku dar qofka la xiriiraya tab-ka Contacts and Addresses (magac, taleefan, email)." },
            { en: "Save (the cloud icon at the top). The customer is ready for a vehicle and a quotation.", so: "Kaydi (icon-ka daruuraha ee sare). Macmiilku waa diyaar u yahay gaari iyo quotation." },
        ],
        tip: { en: "A customer that wrote to us on the website appears in Sales > Website Enquiries. Open it and press Create customer to copy the details.", so: "Macmiil nagu soo qoray website-ka wuxuu ka muuqdaa Sales > Website Enquiries. Fur oo riix Create customer si loo koobiyeeyo xogta." },
    },
    {
        id: "vehicle", icon: "fa-car", img: "g-vehicle.png",
        title: { en: "Add a vehicle", so: "Ku dar gaari" },
        intro: { en: "Every tracker is fitted to a vehicle. The plate number is the main key.", so: "Tracker kasta waxaa lagu rakibaa gaari. Taarikada ayaa ah furaha ugu muhiimsan." },
        steps: [
            { en: "Go to Customers > Vehicles and press New.", so: "Tag Customers > Vehicles oo riix New." },
            { en: "Choose the customer, type the plate number (letters and digits, for example KDA 123A), then the make, model and vehicle type.", so: "Dooro macmiilka, ku qor taarikada (xaraf iyo tiro, tusaale KDA 123A), kadibna nooca, modelka iyo noocyada gaariga." },
            { en: "Save. The system refuses a plate that already exists, so you cannot create it twice.", so: "Kaydi. Nidaamku wuu diidaa taarikad hore u jirtay, sidaas darteed labo jeer lama abuuri karo." },
        ],
        tip: { en: "The tracker, its IMEI and its SIM appear on the vehicle after the installation is completed.", so: "Tracker-ka, IMEI-giisa iyo SIM-kiisa waxay ka muuqdaan gaariga kadib marka rakibaadda la dhammeeyo." },
    },
    {
        id: "quotation", icon: "fa-file-text-o", img: "g-quote-form.png",
        title: { en: "Make a quotation", so: "Samee quotation" },
        intro: { en: "A quotation lists the hardware, the installation and the tracking plan for each vehicle.", so: "Quotation-ku wuxuu liis ka dhigaa hardware-ka, rakibaadda iyo plan-ka raadraaca ee gaari kasta." },
        steps: [
            { en: "Press New quotation on the dashboard (or Sales > Quotations > New).", so: "Riix New quotation ee dashboard-ka (ama Sales > Quotations > New)." },
            { en: "Choose the Customer. If the customer is not in the list, type the name and choose Create, or register the customer first.", so: "Dooro Customer-ka. Haddii aanu liiska ku jirin, ku qor magaca oo dooro Create, ama marka hore diiwaangeli macmiilka." },
            { en: "Press Add a product for every line: the tracker, the installation labour and the tracking plan. Set the quantity.", so: "Riix Add a product khad kasta: tracker-ka, shaqada rakibaadda iyo plan-ka raadraaca. Dooro tirada." },
            { en: "On each line choose the vehicle plate. Without a plate the installation job cannot be planned.", so: "Khad kasta dooro taarikada gaariga. Taarikad la'aan shaqada rakibaadda lama qorsheyn karo." },
            { en: "Check the discount. A discount above the company limit needs a manager to approve it.", so: "Hubi dhimista (discount). Dhimis ka badan xadka shirkadda waxay u baahan tahay in maamule ansixiyo." },
            { en: "Save. Prices come from the product. Finance sets the prices, you do not type them by hand.", so: "Kaydi. Qiimayaasha waxay ka yimaadaan product-ka. Finance ayaa dejiya qiimayaasha, gacanta ma ku qorto." },
        ],
        tip: { en: "Hardware prices are not shown on the website. Customers ask for a quotation, and this is where you make it.", so: "Qiimaha hardware-ka website-ka lagama muujiyo. Macaamiishu waxay weydiistaan quotation, halkanna waa meesha aad ka samaysid." },
    },
    {
        id: "send", icon: "fa-paper-plane", img: "g-quote-send.png",
        title: { en: "Approve, print and send the quotation", so: "Ansixi, daabac oo dir quotation-ka" },
        intro: { en: "Big quotations need a second person to approve them. That protects the company.", so: "Quotation-yada waaweyn waxay u baahan yihiin qof labaad oo ansixiya. Tani waxay ilaalisaa shirkadda." },
        steps: [
            { en: "When the quotation is ready press Request approval (if the system asks for it). A manager sees it under Sales > Waiting for Approval.", so: "Marka quotation-ku diyaar yahay riix Request approval (haddii nidaamku weydiiyo). Maamuluhu wuxuu ka arkaa Sales > Waiting for Approval." },
            { en: "A manager opens it and presses Approve, or Reject with a reason.", so: "Maamuluhu wuu furaa oo riixaa Approve, ama Reject isagoo sabab bixinaya." },
            { en: "Press Print to make the PDF with the LibDex logo, or Send by email to send it to the customer.", so: "Riix Print si loo sameeyo PDF leh logada LibDex, ama Send by email si loogu diro macmiilka." },
            { en: "When the customer agrees press Confirm. The system now creates the installation jobs.", so: "Marka macmiilku oggolaado riix Confirm. Nidaamku hadda wuxuu abuurayaa shaqooyinka rakibaadda." },
        ],
        tip: { en: "You cannot approve your own quotation. Another approver must do it.", so: "Quotation-kaaga naftaada ma ansixin kartid. Ansixiye kale ayaa sameeya." },
    },
    {
        id: "installation", icon: "fa-wrench", img: "g-install.png",
        title: { en: "Install a tracker", so: "Rakib tracker" },
        intro: { en: "The installation job links the customer, the vehicle, the technician and the exact tracker (IMEI).", so: "Shaqada rakibaadda waxay isku xirtaa macmiilka, gaariga, farsamoyaqaanka iyo tracker-ka saxda ah (IMEI)." },
        steps: [
            { en: "Operations: open the job (Installations > All Installations), choose the technician and the date, press Schedule.", so: "Hawlgalka: fur shaqada (Installations > All Installations), dooro farsamoyaqaanka iyo taariikhda, riix Schedule." },
            { en: "Store: give the tracker to the technician with Inventory > Issue / Return to Technician. The tracker is now on the technician's name.", so: "Bakhaarka: u sii tracker-ka farsamoyaqaanka Inventory > Issue / Return to Technician. Tracker-ku hadda wuxuu ku qoran yahay magaca farsamoyaqaanka." },
            { en: "Technician: open My Jobs, press Start job, then add photos, the customer confirmation and the tracker IMEI.", so: "Farsamoyaqaanka: fur My Jobs, riix Start job, kadibna ku dar sawirro, oggolaanshaha macmiilka iyo IMEI-ga tracker-ka." },
            { en: "Press Complete installation. The tracker leaves the technician's stock, the warranty starts and the vehicle shows the device.", so: "Riix Complete installation. Tracker-ku wuxuu ka baxayaa bakhaarka farsamoyaqaanka, damaanadda ayaa bilaabata, gaarigu wuxuu muujiyaa qalabka." },
        ],
        tip: { en: "The same IMEI can never be used twice. If the system refuses it, check the number.", so: "IMEI isku mid ah laba jeer lama isticmaali karo. Haddii nidaamku diido, hubi lambarka." },
    },
    {
        id: "payment", icon: "fa-credit-card", img: "g-payment.png",
        title: { en: "Invoice and payments", so: "Invoice iyo lacag-bixin" },
        intro: { en: "Customers can pay in parts. The invoice always shows what was paid and the balance.", so: "Macaamiishu waxay bixin karaan qayb-qayb. Invoice-ku wuxuu had iyo jeer muujiyaa waxa la bixiyay iyo haraaga." },
        steps: [
            { en: "Finance: create the invoice from the confirmed order (Create invoice) and press Confirm on the invoice.", so: "Finance: ka samee invoice-ka dalabka la xaqiijiyay (Create invoice) oo riix Confirm invoice-ka." },
            { en: "When money arrives press Record a payment on the dashboard (or Pay on the invoice). Type the amount actually received and the method.", so: "Marka lacagtu timaado riix Record a payment ee dashboard-ka (ama Pay invoice-ka). Ku qor lacagta dhabta ah ee la helay iyo habka." },
            { en: "A partial payment is fine: the invoice stays open with the balance. Pay the rest later in the same way.", so: "Lacag qayb ah waa ogol tahay: invoice-ku wuu furan yahay isagoo haraaga muujinaya. Inta kale mar dambe si la mid ah u bixi." },
            { en: "Use Finance > Customer Statement to print everything a customer owes. Overdue Invoices lists late payers.", so: "Isticmaal Finance > Customer Statement si aad u daabacdo wax kasta oo macmiilku leeyahay. Overdue Invoices wuxuu liis ka dhigaa kuwa daahay." },
        ],
        tip: { en: "Only people with the Financial information privilege see invoices and payments.", so: "Kaliya dadka leh xuquuqda Financial information ayaa arka invoices iyo lacagaha." },
    },
    {
        id: "subscription", icon: "fa-refresh", img: "g-renewals.png",
        title: { en: "Subscriptions and renewals", so: "Rukunnada iyo cusboonaysiinta" },
        intro: { en: "Each vehicle has its own subscription with a renewal date.", so: "Gaari kastaa wuxuu leeyahay rukun u gaar ah oo leh taariikh cusboonaysiin." },
        steps: [
            { en: "Open Subscriptions > Renewals Due to see who must renew soon, in order of date.", so: "Fur Subscriptions > Renewals Due si aad u aragto yaa dhawaan cusboonaysiin doona, sida taariikhdu u kala horreyso." },
            { en: "The system sends reminders by itself. Call the customer if a renewal is late.", so: "Nidaamku wuu is diraa xusuusin. La hadal macmiilka haddii cusboonaysiin daahday." },
            { en: "Press Create renewal invoice, then take the payment as usual. After payment the subscription renews.", so: "Riix Create renewal invoice, kadibna qaado lacagta sida caadiga ah. Lacag-bixinta kadib rukunku wuu cusboonaadaa." },
            { en: "Use Suspend to stop a subscription for a reason and Resume to start it again.", so: "Isticmaal Suspend si aad u joojiso rukun sabab awgeed, iyo Resume si aad dib u bilowdo." },
        ],
        tip: { en: "An expired subscription is not deleted. You can see it in Subscriptions > Expired.", so: "Rukun dhacay lama tirtiro. Waxaad ka arki kartaa Subscriptions > Expired." },
    },
    {
        id: "enquiry", icon: "fa-inbox", img: "g-enquiry-reply.png",
        title: { en: "Reply to website messages", so: "Ka jawaab fariimaha website-ka" },
        intro: { en: "Every message from the website arrives here with the sender's email and phone. The sender gets an automatic thank-you email.", so: "Fariin kasta oo website-ka ka timaada halkan bay ku timaadaa iyadoo leh email-ka iyo taleefanka diraha. Diraha waxaa u dhaca email mahadnaq oo si toos ah u socda." },
        steps: [
            { en: "Open Sales > Website Enquiries. New ones are bold. Open one to read the message.", so: "Fur Sales > Website Enquiries. Kuwa cusub waa qaro weyn. Fur mid si aad u akhrido fariinta." },
            { en: "Press Reply by email. Write a few notes in any language, choose the language of the reply, and press Write it for me.", so: "Riix Reply by email. Qor qoraal gaaban luqad kasta, dooro luqadda jawaabta, kadibna riix Write it for me." },
            { en: "Read the draft, change what you like, then press Send. It leaves from the sales address with the ITrackZen by LibDex design.", so: "Akhri qoraalka, beddel wixii aad rabto, kadibna riix Send. Wuxuu ka baxayaa cinwaanka sales isagoo leh naqshadda ITrackZen by LibDex." },
            { en: "Press Create quotation to turn the enquiry into a quotation, or Lost / Spam to close it.", so: "Riix Create quotation si fariinta loogu beddelo quotation, ama Lost / Spam si loo xidho." },
        ],
        tip: { en: "The AI never knows prices or dates unless you type them. Always read before you send.", so: "AI-gu ma yaqaan qiimo ama taariikh haddii aadan qorin. Marwalba akhri ka hor intaadan dirin." },
    },
    {
        id: "roles", icon: "fa-lock", img: "g-roles.png",
        title: { en: "Roles: who sees what", so: "Doorarka: yaa arka maxay" },
        intro: { en: "Each person has their own login and one role. The role decides which menus and records they see.", so: "Qof kastaa wuxuu leeyahay login u gaar ah iyo hal door. Doorku wuxuu go'aamiyaa menus-ka iyo diiwaannada uu arko." },
        steps: [
            { en: "Owner: Settings > Users > New. Type the name and work email.", so: "Milkiilaha: Settings > Users > New. Ku qor magaca iyo email-ka shaqada." },
            { en: "In the ITrackZen access block tick one role (Accountant, Sales Officer, Storekeeper, Technician and so on). The standard Odoo rights are cleared automatically.", so: "Block-ga ITrackZen access calaamadee hal door (Accountant, Sales Officer, Storekeeper, Technician iwm.). Xuquuqda Odoo ee caadiga ah si toos ah ayaa loo tirtiraa." },
            { en: "Add an extra privilege only if needed, for example Approve quotations. Save, then press Send an Invitation Email.", so: "Ku dar xuquuq dheeraad ah kaliya haddii loo baahdo, tusaale Approve quotations. Kaydi, kadibna riix Send an Invitation Email." },
            { en: "The person opens the email, sets a password and signs in at the website admin area or the management address.", so: "Qofku wuxuu furaa email-ka, dejiyaa password oo wuxuu gala meesha admin-ka website-ka ama cinwaanka maamulka." },
        ],
        tip: { en: "A technician sees only their own jobs and equipment. Finance information is shown only to people who need it.", so: "Farsamoyaqaanku wuxuu arkaa oo keliya shaqooyinkiisa iyo qalabkiisa. Xogta maaliyadda waxaa arka kaliya dadka u baahan." },
    },
    {
        id: "look", icon: "fa-moon-o", img: "g-dark.png",
        title: { en: "Dark mode, light mode and language", so: "Dark mode, light mode iyo luqad" },
        intro: { en: "Choose the look that is comfortable for your eyes. The choice is remembered on this computer.", so: "Dooro muuqaalka indhahaaga u raaxada badan. Doorashadu waxay ku xasuusnaanaysaa kombiyuutarkan." },
        steps: [
            { en: "Click the moon button at the top right to switch to dark mode. Click the sun button to go back to light mode.", so: "Riix badhanka dayaxa ee kore midig si aad ugu beddesho dark mode. Riix badhanka qorraxda si aad ugu noqoto light mode." },
            { en: "In this Guide, press the language button at the top to read every lesson in Somali or English.", so: "Hagahan, riix badhanka luqadda ee sare si aad cashar kasta ugu akhrido Af-Soomaali ama Ingiriis." },
        ],
        tip: { en: "Dark mode is easier on the eyes in the evening. Reports and PDFs always stay white so they print well.", so: "Dark mode wuu fududahay habeenkii. Warbixinnada iyo PDF-yada way cadaan ahaanayaan si ay si wanaagsan u daabacmaan." },
    },
];
