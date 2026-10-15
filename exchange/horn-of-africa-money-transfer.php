<?php
require __DIR__ . '/app/bootstrap.php';

$so = lang() === 'so';
$siteName = setting('site_name', 'Hufan Exchange');

$countries = $so ? [
    ['name' => 'Soomaaliya', 'body' => "Soomaaliya waa suuqa aasaasiga ah ee $siteName. EVC Plus (Hormuud Telecom) ayaa ah habka ugu caansan ee lacagta mobilada laga isticmaalo Muqdisho, Hargeysa, Boosaaso, Kismaayo iyo magaalooyinka kale oo dhan — taasoo ka dhigaysa dhabarka adeegyadeena isbeddelka."],
    ['name' => 'Itoobiya', 'body' => 'Dadka Soomaalida ah ee ku nool gobollada Itoobiya ee Soomaalida (sida Jigjiga/Degmada Soomaalida) iyo kuwa ganacsiga la leh Soomaaliya ayaa inta badan u baahan inay lacagta ugu wareejiyaan dariska. Si kastaba ha ahaatee, EVC Plus waa adeeg gaar u ah Soomaaliya; macaamiisha Itoobiya waxay u baahan yihiin qof Soomaaliya ku sugan oo lacagta EVC Plus-ka ah bixiya iyagana ka wareejiya.'],
    ['name' => 'Kenya', 'body' => 'Nairobi waxay martigelisaa beesha Soomaalida ugu badan ee dibadda ku nool, gaar ahaan xaafadda Eastleigh. Macaamiisha halkan waxay badanaa u baahan yihiin inay lacagta u dirtaan ehelkooda Soomaaliya, ama ay ka helaan lacag EVC Plus ah oo ay rabaan inay ugu beddeshaan USDT ama PayPal si ay ugu isticmaalaan dibadda.'],
    ['name' => 'Jabuuti', 'body' => 'Jabuuti waxay la wadaagtaa Soomaaliya xiriir dhaqaale iyo ganacsi oo dheer. Shaqaalaha iyo ganacsatada u socda labada dhinac ayaa inta badan u baahan hab degdeg ah oo lacagta EVC Plus-ka looga beddelo lacago kale oo caalami ah.'],
] : [
    ['name' => 'Somalia', 'body' => "Somalia is $siteName's core market. EVC Plus (Hormuud Telecom) is the dominant mobile money method across Mogadishu, Hargeisa, Bosaso, Kismayo and beyond — it's the backbone of everyday payments, and the starting point for every exchange we process."],
    ['name' => 'Ethiopia', 'body' => "Somalis in Ethiopia's Somali Region (around Jigjiga) and traders with cross-border business ties to Somalia often need to move funds between the two. EVC Plus itself is a Somalia-specific mobile wallet, so customers in Ethiopia typically coordinate with a contact inside Somalia who holds and converts the EVC Plus balance on their behalf."],
    ['name' => 'Kenya', 'body' => "Nairobi is home to one of the largest Somali diaspora communities, especially around Eastleigh. Customers here often need to send funds to family in Somalia, or convert EVC Plus balances they've received into USDT or PayPal for use abroad."],
    ['name' => 'Djibouti', 'body' => 'Djibouti shares deep trade and family ties with Somalia. Workers and traders moving between the two often need a fast way to convert EVC Plus balances into internationally usable currency.'],
];

$faqs = $so ? [
    ['q' => 'Ma u shaqeeyaa EVC Plus dalal kale oo aan Soomaaliya ahayn?', 'a' => 'EVC Plus waa adeeg gaar u ah Soomaaliya (Hormuud Telecom). Dadka ku nool Kenya, Itoobiya ama Jabuuti ma heli karaan akoon EVC Plus ah, laakiin way la shaqeyn karaan qof Soomaaliya ku sugan oo EVC Plus haysta.'],
    ['q' => 'Sidee ayaan ku bixin karaa khidmadda halkan?', 'a' => "Waxaad u baahan tahay inaad is diiwaangeliso lambarkaaga EVC Plus, kadibna aad dooratid khidmadda aad u beddelaysid (USDT, PayPal ama MoneyGo). $siteName kuma shaqeyso lacago kale oo aan EVC Plus ahayn si toos ah."],
    ['q' => 'Ma amaan baa macaamiisha diaspora-ga ah?', 'a' => 'Haa — nidaamku wuxuu isticmaalaa amniga casriga ah (bcrypt, CSRF, xaqiijin), oo dalab kasta wuxuu leeyahay taariikh iyo rasiid la daabaci karo.'],
] : [
    ['q' => 'Does EVC Plus work outside Somalia?', 'a' => "EVC Plus is a Somalia-specific mobile wallet from Hormuud Telecom. People in Kenya, Ethiopia or Djibouti can't open an EVC Plus account directly, but can coordinate with a contact inside Somalia who holds one."],
    ['q' => 'How do diaspora customers use this service?', 'a' => "You need to register with a Somali EVC Plus phone number, then choose which currency to convert into (USDT, PayPal or MoneyGo). $siteName doesn't process other mobile money networks directly."],
    ['q' => 'Is it safe for customers across the region?', 'a' => 'Yes — the platform uses bcrypt password hashing, CSRF protection on every form, and keeps a full order history with a printable receipt for every transaction.'],
];

$pageTitle = $so
    ? 'Wareejinta Lacagta Geeska Afrika — Soomaaliya, Itoobiya, Kenya, Jabuuti'
    : 'Money Transfer in the Horn of Africa — Somalia, Ethiopia, Kenya & Djibouti';
$pageDescription = $so
    ? 'Sida EVC Plus Soomaaliyeed loogu beddelo USDT, PayPal iyo MoneyGo — faahfaahin ku saabsan Soomaaliya, Itoobiya, Kenya iyo Jabuuti.'
    : 'How Somalia\'s EVC Plus mobile money connects to the wider Horn of Africa — practical context for Somalia, Ethiopia, Kenya and Djibouti, and how to convert EVC Plus into USDT, PayPal or MoneyGo.';
$structuredData = [
    [
        '@context' => 'https://schema.org',
        '@type'    => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => $siteName, 'item' => full_url('')],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $pageTitle, 'item' => full_url('horn-of-africa-money-transfer.php')],
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
        <p><?= $so ? 'Sida EVC Plus Soomaaliyeed ugu xiriirto gobolka Geeska Afrika' : "How Somalia's mobile money reaches the wider Horn of Africa region" ?></p>
      </div>
    </div>

    <article class="article card card-body">
      <?php if ($so): ?>
        <p><?= e($siteName) ?> waxay ka shaqaysaa Soomaaliya, laakiin macaamiisheeda iyo saamaynteeda way ka gaadhaan gobolka Geeska Afrika oo dhan — beesha diaspora-ga ee Kenya, ganacsatada iyo qoysaska ku kala jira xuduudaha Itoobiya iyo Jabuuti. Bogga hoose wuxuu sharraxayaa sida EVC Plus (lacagta mobilada ee Hormuud Telecom) ugu xiriirto dalal kale, iyo sida loo isticmaalo <?= e($siteName) ?> si looga beddelo USDT, PayPal ama MoneyGo.</p>
      <?php else: ?>
        <p><?= e($siteName) ?> operates in Somalia, but its customers and impact reach across the Horn of Africa — the diaspora community in Kenya, and traders and families spanning the Ethiopian and Djiboutian borders. Below is practical context on how EVC Plus (Hormuud Telecom's mobile money) connects to the wider region, and how to use <?= e($siteName) ?> to convert it into USDT, PayPal or MoneyGo.</p>
      <?php endif; ?>

      <?php foreach ($countries as $c): ?>
      <h2><?= e($c['name']) ?></h2>
      <p><?= e($c['body']) ?></p>
      <?php endforeach; ?>

      <h2><?= $so ? 'Su\'aalaha Badanaa La Weydiiyo' : 'Frequently Asked Questions' ?></h2>
      <div class="faq-list">
        <?php foreach ($faqs as $f): ?>
        <details class="faq-item"><summary><?= e($f['q']) ?></summary><p><?= e($f['a']) ?></p></details>
        <?php endforeach; ?>
      </div>

      <p class="mt-3">
        <a class="btn btn-primary btn-lg" href="<?= e(url('send-money-to-somalia.php')) ?>"><?= $so ? 'Akhri hagaha EVC Plus ee Soomaaliya' : 'Read the full EVC Plus conversion guide' ?> <?= icon('arrow-right', 18) ?></a>
      </p>
    </article>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
