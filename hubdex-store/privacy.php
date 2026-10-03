<?php
require_once __DIR__ . '/includes/functions.php';

$page_title       = 'Privacy Policy | Hubdex Store - Hubdex Store LTD';
$page_description = 'Read the Hubdex Store privacy policy. Learn how Hubdex Store LTD collects, uses and protects your personal data when you visit our online store website.';
$page_keywords    = 'Hubdex Store privacy policy, Hubdex privacy, Hubdex Store LTD data protection, ecommerce privacy, online store';
$page_path        = 'privacy.php';
$page_id          = 'privacy';
$breadcrumb_name  = 'Privacy Policy';
$last_updated     = '3 October 2026';

require __DIR__ . '/includes/header.php';
?>

<section class="page-hero" aria-labelledby="page-title">
    <div class="container narrow">
        <nav class="breadcrumb reveal" aria-label="Breadcrumb"><a href="./">Home</a><span>/</span><span aria-current="page">Privacy Policy</span></nav>
        <h1 id="page-title" class="reveal">Privacy Policy</h1>
        <p class="lead reveal">How Hubdex Store LTD collects, uses and protects your personal information.</p>
        <p class="meta reveal">Last updated: <?= e($last_updated) ?></p>
    </div>
</section>

<section class="section section-tight">
    <div class="container legal-layout">
        <aside class="legal-toc reveal" aria-label="On this page">
            <h2>On this page</h2>
            <ol>
                <li><a href="#who-we-are">Who we are</a></li>
                <li><a href="#data-we-collect">Information we collect</a></li>
                <li><a href="#how-we-use">How we use your information</a></li>
                <li><a href="#legal-basis">Legal basis</a></li>
                <li><a href="#cookies">Cookies</a></li>
                <li><a href="#sharing">Sharing your information</a></li>
                <li><a href="#retention">Data retention</a></li>
                <li><a href="#security">Security</a></li>
                <li><a href="#your-rights">Your rights</a></li>
                <li><a href="#changes">Changes to this policy</a></li>
                <li><a href="#contact">Contact us</a></li>
            </ol>
        </aside>

        <article class="legal-content content-card reveal">
            <h2 id="who-we-are">1. Who we are</h2>
            <p>This website is operated by <strong><?= e(COMPANY_LEGAL_NAME) ?></strong> (&ldquo;Hubdex Store&rdquo;, &ldquo;Hubdex&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;). Hubdex Store LTD is the data controller responsible for your personal information collected through <a href="<?= e(url()) ?>"><?= e(preg_replace('#^https?://#', '', SITE_URL)) ?></a>.</p>
            <p>Hubdex Store is an ecommerce platform currently under development. This policy explains how we handle personal data while the website operates as a pre-launch &ldquo;coming soon&rdquo; site, and it will be updated before our online store opens for orders.</p>

            <h2 id="data-we-collect">2. Information we collect</h2>
            <h3>Information you give us</h3>
            <ul>
                <li><strong>Launch notifications:</strong> your e-mail address when you click &ldquo;Notify Me&rdquo;.</li>
                <li><strong>Contact enquiries:</strong> your name, e-mail address, phone number (optional) and message when you use our contact form.</li>
            </ul>
            <h3>Information collected automatically</h3>
            <ul>
                <li>Technical data such as IP address, browser type, device information and pages visited, recorded in standard server logs by our hosting provider.</li>
                <li>Basic security information used to prevent spam and abuse of our forms.</li>
            </ul>

            <h2 id="how-we-use">3. How we use your information</h2>
            <ul>
                <li>To notify you when Hubdex Store launches and share early-access offers you requested.</li>
                <li>To respond to your questions, partnership or supplier enquiries.</li>
                <li>To operate, maintain, secure and improve our website.</li>
                <li>To comply with legal obligations.</li>
            </ul>
            <p>We do not sell your personal information.</p>

            <h2 id="legal-basis">4. Legal basis for processing</h2>
            <p>Where data protection laws such as the UK GDPR or EU GDPR apply, we process your data on the basis of your <strong>consent</strong> (launch notifications), our <strong>legitimate interests</strong> (responding to enquiries and keeping the site secure) and <strong>legal obligations</strong> where applicable. You may withdraw consent at any time.</p>

            <h2 id="cookies">5. Cookies</h2>
            <p>The Hubdex Store website uses only a strictly necessary session cookie to protect our forms against misuse. We do not currently use advertising or tracking cookies. If we add analytics or marketing cookies in future, we will update this policy and request your consent where required.</p>

            <h2 id="sharing">6. Sharing your information</h2>
            <p>We share personal data only with trusted service providers who help us run the website (for example, our web hosting and e-mail providers), and only as needed to provide their services. We may also disclose information where required by law.</p>

            <h2 id="retention">7. Data retention</h2>
            <p>We keep notification sign-ups until you unsubscribe or until the launch campaign ends. Contact enquiries are kept for as long as needed to respond and for reasonable record keeping, typically no longer than 24 months.</p>

            <h2 id="security">8. Security</h2>
            <p>Hubdex Store LTD uses appropriate technical and organisational measures, including encrypted HTTPS connections and access-restricted storage, to protect your personal information.</p>

            <h2 id="your-rights">9. Your rights</h2>
            <p>Depending on where you live, you may have the right to access, correct, delete, restrict or object to the processing of your personal data, and the right to data portability. You also have the right to complain to your local data protection authority (in the UK, the Information Commissioner&rsquo;s Office). To exercise your rights, contact us using the details below.</p>

            <h2 id="changes">10. Changes to this policy</h2>
            <p>We may update this privacy policy from time to time, especially when the Hubdex Store online store launches. The &ldquo;Last updated&rdquo; date at the top of this page shows when it was last changed.</p>

            <h2 id="contact">11. Contact us</h2>
            <p>If you have any questions about this policy or how Hubdex Store LTD handles your data, please contact us at <a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a> or via our <a href="contact.php">contact page</a>.</p>
        </article>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
