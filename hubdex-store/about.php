<?php
require_once __DIR__ . '/includes/functions.php';

$page_title       = 'About Hubdex Store | Ecommerce Platform by Hubdex Store LTD';
$page_description = 'Learn about Hubdex Store, the upcoming online shopping platform by Hubdex Store LTD. Our mission, values and vision for a reliable, customer-first ecommerce experience.';
$page_keywords    = 'about Hubdex Store, Hubdex, Hubdex Store LTD, Hubdex company, ecommerce platform, online shopping, online store';
$page_path        = 'about.php';
$page_id          = 'about';
$page_type        = 'AboutPage';
$breadcrumb_name  = 'About';

require __DIR__ . '/includes/header.php';
?>

<section class="page-hero" aria-labelledby="page-title">
    <div class="container narrow">
        <nav class="breadcrumb reveal" aria-label="Breadcrumb"><a href="./">Home</a><span>/</span><span aria-current="page">About</span></nav>
        <h1 id="page-title" class="reveal">About <span class="gradient-text">Hubdex Store</span></h1>
        <p class="lead reveal">Hubdex Store is a modern ecommerce platform by Hubdex Store LTD, built to make online shopping simple, reliable and enjoyable for everyone.</p>
    </div>
</section>

<section class="section section-tight" aria-labelledby="story-title">
    <div class="container split">
        <div class="reveal">
            <span class="eyebrow">Our story</span>
            <h2 id="story-title">Who we are</h2>
            <p>Hubdex Store LTD was founded with a clear idea: shopping online should feel effortless and trustworthy. Too many online stores make customers choose between price, quality and service. At Hubdex, we believe you deserve all three.</p>
            <p>Hubdex Store is the ecommerce platform we are building to deliver on that promise. It will bring together a carefully curated range of quality products, transparent pricing, secure payments and dependable delivery &mdash; all in one modern online store.</p>
            <p>Hubdex Store is currently under development and will be launched soon. Every part of the platform is being designed with customers first.</p>
        </div>
        <div class="stat-grid reveal">
            <div class="stat-card"><strong>100%</strong><span>Customer-first approach</span></div>
            <div class="stat-card"><strong>24/7</strong><span>Online shopping access</span></div>
            <div class="stat-card"><strong>Secure</strong><span>Encrypted checkout</span></div>
            <div class="stat-card"><strong>Soon</strong><span>Official launch</span></div>
        </div>
    </div>
</section>

<section class="section" aria-labelledby="mission-title">
    <div class="container">
        <div class="section-head reveal">
            <span class="eyebrow">Mission &amp; vision</span>
            <h2 id="mission-title">What drives Hubdex Store LTD</h2>
        </div>
        <div class="feature-grid cols-2">
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('sparkle', 24) ?></span>
                <h3>Our mission</h3>
                <p>To give customers a reliable place to discover, order and shop quality products online, backed by honest service and secure technology.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('globe', 24) ?></span>
                <h3>Our vision</h3>
                <p>To grow Hubdex into a trusted ecommerce brand that customers return to with confidence &mdash; known for quality, fair prices and great experiences.</p>
            </article>
        </div>
    </div>
</section>

<section class="section" aria-labelledby="values-title">
    <div class="container">
        <div class="section-head reveal">
            <span class="eyebrow">Our values</span>
            <h2 id="values-title">The principles behind every order</h2>
        </div>
        <div class="feature-grid">
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('shield', 24) ?></span>
                <h3>Trust &amp; security</h3>
                <p>Your data and payments are protected with industry-standard security throughout Hubdex Store.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('star', 24) ?></span>
                <h3>Quality first</h3>
                <p>We work with reliable suppliers so every product meets the standards Hubdex customers expect.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('truck', 24) ?></span>
                <h3>Dependable delivery</h3>
                <p>Clear timelines and tracked shipping so your online shopping arrives when promised.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('support', 24) ?></span>
                <h3>Real support</h3>
                <p>A responsive Hubdex Store LTD support team that treats every customer like a priority.</p>
            </article>
        </div>
    </div>
</section>

<section class="section section-tight" aria-labelledby="company-title">
    <div class="container narrow">
        <div class="content-card reveal">
            <h2 id="company-title">Company information</h2>
            <dl class="company-dl">
                <div><dt>Brand name</dt><dd><?= e(SITE_NAME) ?> (also known as <?= e(SITE_SHORT_NAME) ?>)</dd></div>
                <div><dt>Legal company name</dt><dd><?= e(COMPANY_LEGAL_NAME) ?></dd></div>
                <div><dt>Business type</dt><dd>Ecommerce &amp; online retail</dd></div>
                <div><dt>Website</dt><dd><a href="<?= e(url()) ?>"><?= e(preg_replace('#^https?://#', '', SITE_URL)) ?></a></dd></div>
                <div><dt>E-mail</dt><dd><a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a></dd></div>
                <?php if (COMPANY_ADDRESS !== ''): ?>
                <div><dt>Address</dt><dd><?= e(COMPANY_ADDRESS) ?></dd></div>
                <?php endif; ?>
                <div><dt>Status</dt><dd>Under development &middot; Launching soon</dd></div>
            </dl>
        </div>
    </div>
</section>

<section class="section cta" aria-labelledby="cta-title">
    <div class="container">
        <div class="cta-card reveal">
            <h2 id="cta-title">Want to work with Hubdex Store?</h2>
            <p>Suppliers, partners and future customers &mdash; we'd love to hear from you.</p>
            <a class="btn btn-light" href="contact.php">Contact Hubdex Store LTD <?= icon('arrow', 18) ?></a>
        </div>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
