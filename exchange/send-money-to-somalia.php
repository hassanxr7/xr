<?php
require __DIR__ . '/app/bootstrap.php';

$so = lang() === 'so';
$siteName = setting('site_name', 'Hufan Exchange');
$pairs = active_pairs();

$faqs = $so ? [
    ['q' => 'EVC Plus ma u beddeli karaa USDT iyo PayPal?', 'a' => "Haa. $siteName waxay kuu ogolaanaysaa inaad EVC Plus ugu beddesho USDT (TRC20/BEP20), PayPal ama MoneyGo — si fudud, lacagtaada ayaad u dirtaa, kadibna waxaad heshaa qiimahaaga kala duwanaanta ku saleysan."],
    ['q' => 'Intee in le\'eg ayay qaadataa isbeddelku?', 'a' => 'Inta badan dalabyada waxaa la fuliyaa 5–30 daqiiqo gudahood marka lacagta la xaqiijiyo. Waqtiga dhabta ahi wuxuu ku xiran yahay nooca khidmadda iyo xawliga xaqiijinta.'],
    ['q' => 'Waa maxay kharashyada?', 'a' => 'Kharashku wuxuu ku xiran yahay labadaas khidmadood ee aad dooratay (tusaale, EVC Plus → USDT). Qiimaha kharashka iyo heerka sarrifka waxaad ka arki kartaa shaxda hoose ka hor inta aadan bilaabin dalabkaaga — lama qariyo wax kharash ah.'],
    ['q' => 'Ma u baahanahay akoon?', 'a' => 'Haa, waxaad u baahan tahay inaad is diiwaangeliso lambarkaaga EVC Plus si loo hubiyo amniga lacagtaada iyo si aad u hesho taariikhda dalabyadaada.'],
    ['q' => 'Ma amaan baa inaan halkan ku isticmaalo lacagtayda?', 'a' => "Haa — $siteName waxay isticmaashaa password-yo la sifeeyay (bcrypt), tokenno CSRF foom kasta, iyo xaqiijin aad u adag. Marka macaamiisha la xaqiijiyo, waxaad heli kartaa rasiid daabacan oo dhammaystiran."],
    ['q' => 'Immisa yar/ugu badnaan ayaan dirsan karaa?', 'a' => 'Khidmad kasta (EVC Plus, USDT, PayPal, MoneyGo) waxay leedahay xaddi ugu yar iyo ugu badnaan oo si gaar ah loo dejiyay — waxaad ka arki kartaa shaxda qiimaha ee bogga hore.'],
] : [
    ['q' => 'Can I really convert EVC Plus to USDT or PayPal?', 'a' => "Yes. $siteName lets you convert EVC Plus (Hormuud's mobile money) into USDT (TRC20/BEP20), PayPal balance, or MoneyGo — you send your EVC Plus payment, confirm it, and receive the converted amount at a clear, published rate."],
    ['q' => 'How long does an EVC Plus conversion take?', 'a' => 'Most orders are completed within 5–30 minutes once your payment is verified. Some payment methods confirm instantly in real time; others are checked manually by our team.'],
    ['q' => 'What fees does Hufan Exchange charge?', 'a' => 'Fees depend on the pair you choose (e.g. EVC Plus → USDT). The exact fee and exchange rate are always shown before you confirm your order — nothing is hidden or added later.'],
    ['q' => 'Do I need to create an account?', 'a' => 'Yes, a quick sign-up with your EVC Plus phone number is required — this protects your funds and gives you an order history and printable statements.'],
    ['q' => 'Is it safe to exchange money here?', 'a' => 'Yes. Passwords are hashed with bcrypt, every form is protected by a CSRF token, and login attempts are rate-limited. Completed orders get a full printable receipt for your records.'],
    ['q' => 'What are the minimum and maximum amounts?', 'a' => 'Each pair (EVC Plus, USDT, PayPal, MoneyGo) has its own minimum and maximum limits, shown on the live rates table on our homepage before you start an order.'],
];

$pageTitle = $so
    ? 'U beddel EVC Plus USDT, PayPal iyo MoneyGo — Degmooyinka Soomaaliya oo dhan'
    : 'Convert EVC Plus to USDT, PayPal & MoneyGo in Somalia';
$pageDescription = $so
    ? "Si degdeg ah oo amaan ah u beddel EVC Plus USDT (TRC20/BEP20), PayPal ama MoneyGo. Qiimayaal cad, kharash yar, iyo adeeg 24/7 ah oo looga adeegsan karo Soomaaliya oo dhan."
    : 'Convert EVC Plus (Hormuud mobile money) to USDT (TRC20/BEP20), PayPal or MoneyGo in minutes. Clear live rates, low fees, and 24/7 service across Somalia — Mogadishu, Hargeisa, Bosaso, Kismayo and beyond.';
$structuredData = [
    [
        '@context' => 'https://schema.org',
        '@type'    => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => $siteName, 'item' => full_url('')],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $pageTitle, 'item' => full_url('send-money-to-somalia.php')],
        ],
    ],
    [
        '@context' => 'https://schema.org',
        '@type'    => 'FAQPage',
        'mainEntity' => array_map(fn ($f) => [
            '@type' => 'Question',
            'name' => $f['q'],
            'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f['a']],
        ], $faqs),
    ],
];
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container">
    <div class="page-head">
      <div>
        <h1><?= e($pageTitle) ?></h1>
        <p><?= $so ? 'Hagaha dhammaystiran ee Soomaalida u baahan inay EVC Plus ugu beddesho lacag caalami ah' : 'The complete guide for Somalis who need to turn EVC Plus mobile money into internationally usable funds' ?></p>
      </div>
    </div>

    <article class="article card card-body">
      <?php if ($so): ?>
        <p><strong>EVC Plus</strong>, adeegga lacagta mobilada ee Hormuud Telecom, waa habka ugu caansan ee Soomaalidu lacagta ugu isticmaasho maalin kasta. Laakiin dhowr sababood oo caadi ah ayaa jira oo aad u baahan tahay inaad EVC Plus-kaaga ugu beddesho lacag kale: shaqaalaha xorta ah (freelancers) ee lacagta looga helo Upwork ama Fiverr, ardayda bixinaysa lacagaha waxbarashada dibadda, ganacsatada u baahan USDT si ay wax uga iibsadaan ama ula macaamilaan dibadda, iyo qoysaska diaspora-ga ah ee u baahan inay lacagta Soomaaliya kaga soo saaraan hab caalami ah.</p>
        <p><?= e($siteName) ?> waa goob isweydaarsi oo loogu talagalay si gaar ah isbeddelka <strong>EVC Plus → MoneyGo, USDT (TRC20/BEP20) iyo PayPal</strong>. Habka waa mid toos ah: geli lacagta aad doonayso inaad bixiso, ka dooro khidmadda aad doonayso inaad hesho, xaqiiji, oo waxaad heli doontaa lacagtaada xaddi gaaban gudihiis.</p>

        <h2>Qiimaha hadda ee isbeddelka EVC Plus</h2>
        <?php if ($pairs): ?>
        <div class="rate-mini">
          <?php foreach (array_slice($pairs, 0, 6) as $p): ?>
          <div class="rate-mini-card">
            <div class="pair"><?= gw_badge($p['from_name'], $p['from_color'], $p['from_logo'], 'xs') ?> <?= e($p['from_name']) ?> <?= icon('arrow-right', 13) ?> <?= gw_badge($p['to_name'], $p['to_color'], $p['to_logo'], 'xs') ?> <?= e($p['to_name']) ?></div>
            <div class="rate">1 <?= e($p['from_currency']) ?> = <?= e(fmt_amount($p['rate'], 4)) ?> <?= e($p['to_currency']) ?></div>
          </div>
          <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <h2>EVC Plus → USDT (TRC20 / BEP20)</h2>
        <p>USDT waa lacag crypto ah oo qiimahiisu la mid yahay Dollarka Mareykanka, taas oo ka dhigaysa mid ku habboon kaydinta iyo wareejinta lacagta dibadda. Waxaa ku habboon dadka ka shaqeeya goobaha online-ka ah, ganacsatada isticmaala Binance P2P, iyo qof kasta oo u baahan USDT si uu ula macaamilo iibiyeyaal caalami ah.</p>

        <h2>EVC Plus → PayPal</h2>
        <p>Dad badan oo Soomaali ah ayaa ka shaqeeya goobaha sida Upwork, Fiverr ama Freelancer, laakiin waxay u baahan yihiin PayPal si ay u helaan ama u bixiyaan lacag. <?= e($siteName) ?> waxay kuu fududaynaysaa inaad EVC Plus-kaaga ku beddesho PayPal si degdeg ah.</p>

        <h2>EVC Plus → MoneyGo</h2>
        <p>MoneyGo waa hal-abuur kale oo lagu wareejiyo lacagta — ku habboon kuwa u baahan inay si fudud ugu gudbiyaan lacagtooda akoon kale oo aan EVC Plus ahayn.</p>

        <h2>Sida loo isticmaalo <?= e($siteName) ?></h2>
        <ul>
          <li>Is diiwaangeli lambarkaaga EVC Plus iyo password aad u adag.</li>
          <li>Dooro khidmadda aad u beddelaysid lacagtaada (tusaale EVC Plus → USDT).</li>
          <li>Geli xaddiga aad diraysid, hubi qiimaha iyo kharashka, kadibna xaqiiji dalabka.</li>
          <li>Bixi EVC Plus-kaaga oo geli Transaction ID-ga — ama, haddii la shido, isticmaal xaqiijin degdeg ah.</li>
          <li>Hel lacagtaada khidmadda aad dooratay, kadibna daabac rasiidkaaga.</li>
        </ul>
      <?php else: ?>
        <p><strong>EVC Plus</strong>, Hormuud Telecom's mobile money service, is how most Somalis move money every day. But there are several everyday reasons you'd need to convert that EVC Plus balance into something else: freelancers paid through Upwork or Fiverr, students paying tuition fees abroad, business owners who need USDT to pay international suppliers, and diaspora families who need to move money out of Somalia in a form usable abroad.</p>
        <p><?= e($siteName) ?> is an exchange platform built specifically for <strong>EVC Plus → MoneyGo, USDT (TRC20/BEP20) and PayPal</strong> conversions. The process is simple: enter the amount you want to send, pick what you want to receive, confirm, and get your converted funds within minutes.</p>

        <h2>Current EVC Plus exchange rates</h2>
        <?php if ($pairs): ?>
        <div class="rate-mini">
          <?php foreach (array_slice($pairs, 0, 6) as $p): ?>
          <div class="rate-mini-card">
            <div class="pair"><?= gw_badge($p['from_name'], $p['from_color'], $p['from_logo'], 'xs') ?> <?= e($p['from_name']) ?> <?= icon('arrow-right', 13) ?> <?= gw_badge($p['to_name'], $p['to_color'], $p['to_logo'], 'xs') ?> <?= e($p['to_name']) ?></div>
            <div class="rate">1 <?= e($p['from_currency']) ?> = <?= e(fmt_amount($p['rate'], 4)) ?> <?= e($p['to_currency']) ?></div>
          </div>
          <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <h2>EVC Plus to USDT (TRC20 / BEP20)</h2>
        <p>USDT is a US-dollar-pegged cryptocurrency, which makes it a practical way to hold value and move money internationally. It's popular with online workers, traders using Binance P2P, and anyone who needs to pay or get paid by international suppliers and clients.</p>

        <h2>EVC Plus to PayPal</h2>
        <p>Many Somalis earn income on platforms like Upwork, Fiverr or Freelancer, all of which rely on PayPal for payouts and payments. <?= e($siteName) ?> makes it quick to turn your EVC Plus balance into PayPal funds, or the reverse when the pair is enabled.</p>

        <h2>EVC Plus to MoneyGo</h2>
        <p>MoneyGo is another supported transfer method — useful when you need to move your converted funds into a different wallet than EVC Plus.</p>

        <h2>How it works</h2>
        <ul>
          <li>Sign up with your EVC Plus phone number and a strong password.</li>
          <li>Choose the pair you want to convert (e.g. EVC Plus → USDT).</li>
          <li>Enter the amount, review the rate and fee, then confirm your order.</li>
          <li>Pay with EVC Plus and submit the Transaction ID — or use real-time verification where it's enabled.</li>
          <li>Receive your funds in the method you chose, then print your receipt.</li>
        </ul>
      <?php endif; ?>

      <h2><?= $so ? 'Su\'aalaha Badanaa La Weydiiyo' : 'Frequently Asked Questions' ?></h2>
      <div class="faq-list">
        <?php foreach ($faqs as $f): ?>
        <details class="faq-item"><summary><?= e($f['q']) ?></summary><p><?= e($f['a']) ?></p></details>
        <?php endforeach; ?>
      </div>

      <p class="mt-3"><a class="btn btn-primary btn-lg" href="<?= e(url('')) ?>#exchange"><?= $so ? 'Bilow isbeddelkaaga hadda' : 'Start your exchange now' ?> <?= icon('arrow-right', 18) ?></a></p>
    </article>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
