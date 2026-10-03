<?php
require_once __DIR__ . '/includes/functions.php';

$page_title       = 'Terms and Conditions | Hubdex Store - Hubdex Store LTD';
$page_description = 'Terms and conditions for using the Hubdex Store website, operated by Hubdex Store LTD. Please read these terms before using our upcoming online store.';
$page_keywords    = 'Hubdex Store terms and conditions, Hubdex terms, Hubdex Store LTD terms of use, ecommerce terms, online shopping, online store';
$page_path        = 'terms.php';
$page_id          = 'terms';
$breadcrumb_name  = 'Terms and Conditions';
$last_updated     = '3 October 2026';

require __DIR__ . '/includes/header.php';
?>

<section class="page-hero" aria-labelledby="page-title">
    <div class="container narrow">
        <nav class="breadcrumb reveal" aria-label="Breadcrumb"><a href="./">Home</a><span>/</span><span aria-current="page">Terms and Conditions</span></nav>
        <h1 id="page-title" class="reveal">Terms and Conditions</h1>
        <p class="lead reveal">The rules for using the Hubdex Store website, provided by Hubdex Store LTD.</p>
        <p class="meta reveal">Last updated: <?= e($last_updated) ?></p>
    </div>
</section>

<section class="section section-tight">
    <div class="container legal-layout">
        <aside class="legal-toc reveal" aria-label="On this page">
            <h2>On this page</h2>
            <ol>
                <li><a href="#introduction">Introduction</a></li>
                <li><a href="#pre-launch">Pre-launch website</a></li>
                <li><a href="#use">Acceptable use</a></li>
                <li><a href="#ip">Intellectual property</a></li>
                <li><a href="#orders">Future orders &amp; products</a></li>
                <li><a href="#links">Third-party links</a></li>
                <li><a href="#liability">Limitation of liability</a></li>
                <li><a href="#privacy">Privacy</a></li>
                <li><a href="#changes">Changes to these terms</a></li>
                <li><a href="#law">Governing law</a></li>
                <li><a href="#contact">Contact</a></li>
            </ol>
        </aside>

        <article class="legal-content content-card reveal">
            <h2 id="introduction">1. Introduction</h2>
            <p>These terms and conditions govern your use of the Hubdex Store website at <a href="<?= e(url()) ?>"><?= e(preg_replace('#^https?://#', '', SITE_URL)) ?></a>. The website is owned and operated by <strong><?= e(COMPANY_LEGAL_NAME) ?></strong> (&ldquo;Hubdex Store&rdquo;, &ldquo;Hubdex&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing or using this website you agree to these terms. If you do not agree, please do not use the website.</p>

            <h2 id="pre-launch">2. Pre-launch website</h2>
            <p>Hubdex Store is an ecommerce platform that is currently under development. At this stage the website provides information about Hubdex Store LTD and allows you to sign up for launch notifications or contact us. No products can be purchased yet, and nothing on this website constitutes an offer to sell.</p>

            <h2 id="use">3. Acceptable use</h2>
            <p>You agree to use the Hubdex Store website lawfully and not to:</p>
            <ul>
                <li>submit false, misleading or unlawful information through our forms;</li>
                <li>attempt to gain unauthorised access to the website, servers or data;</li>
                <li>introduce viruses, malware or any harmful code;</li>
                <li>use automated systems to send spam or scrape content without permission.</li>
            </ul>

            <h2 id="ip">4. Intellectual property</h2>
            <p>The names &ldquo;Hubdex&rdquo; and &ldquo;Hubdex Store&rdquo;, our logo, design, text and graphics are the property of Hubdex Store LTD or its licensors and are protected by intellectual property laws. You may not copy, reproduce or use them without our prior written consent.</p>

            <h2 id="orders">5. Future orders &amp; products</h2>
            <p>When the Hubdex Store online store launches, additional terms covering orders, pricing, payments, delivery, returns and refunds will apply and will be published on this website. Those terms will form part of any contract between you and Hubdex Store LTD.</p>

            <h2 id="links">6. Third-party links</h2>
            <p>Our website may contain links to third-party websites or social media platforms. Hubdex Store LTD is not responsible for the content, policies or practices of those websites.</p>

            <h2 id="liability">7. Limitation of liability</h2>
            <p>The website is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. While we work to keep information accurate and up to date, we make no warranties that the website will be uninterrupted or error-free. To the fullest extent permitted by law, Hubdex Store LTD is not liable for any indirect or consequential loss arising from your use of the website. Nothing in these terms limits liability that cannot be excluded by law.</p>

            <h2 id="privacy">8. Privacy</h2>
            <p>Your use of the Hubdex Store website is also governed by our <a href="privacy.php">Privacy Policy</a>, which explains how we handle your personal information.</p>

            <h2 id="changes">9. Changes to these terms</h2>
            <p>We may revise these terms at any time, particularly when Hubdex Store opens for shopping. Updated terms take effect when published on this page. Please check back regularly.</p>

            <h2 id="law">10. Governing law</h2>
            <p>These terms are governed by the laws of England and Wales, and any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales, unless mandatory consumer laws in your country provide otherwise.</p>

            <h2 id="contact">11. Contact</h2>
            <p>Questions about these terms? Contact Hubdex Store LTD at <a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a> or via our <a href="contact.php">contact page</a>.</p>
        </article>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
