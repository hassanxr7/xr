<?php
require_once __DIR__ . '/includes/functions.php';

$page_title       = 'Hubdex Store | Coming Soon - Online Shopping by Hubdex Store LTD';
$page_description = 'Hubdex Store is coming soon. A modern ecommerce and online shopping platform by Hubdex Store LTD. Discover, order and shop quality products online. Get notified at launch.';
$page_keywords    = 'Hubdex Store, Hubdex, Hubdex Store LTD, Hubdex online store, ecommerce, online shopping, online store, coming soon';
$page_path        = '';
$page_id          = 'home';

// Flash message for non-JS form submissions
$notify_status  = $_GET['notify'] ?? '';
$notify_message = [
    'success' => "You're on the list! We'll e-mail you when Hubdex Store launches.",
    'exists'  => "You're already subscribed - we'll be in touch at launch.",
    'invalid' => 'Please enter a valid e-mail address.',
    'error'   => 'Something went wrong. Please try again in a moment.',
][$notify_status] ?? '';

require __DIR__ . '/includes/header.php';
?>

<section class="hero" aria-labelledby="hero-title">
    <div class="container hero-grid">
        <div class="hero-copy">
            <span class="badge reveal"><span class="pulse-dot"></span> Under development &middot; Launching soon</span>

            <h1 id="hero-title" class="reveal">
                <span class="gradient-text">Hubdex Store</span> is Coming Soon
            </h1>

            <p class="lead reveal">A modern online shopping platform by Hubdex Store LTD.</p>

            <p class="hero-desc reveal">We are building a reliable ecommerce platform where customers can discover, order, and shop quality products online. Hubdex Store is currently under development and will be launched soon.</p>

            <div class="countdown reveal" id="countdown" data-launch="<?= e(LAUNCH_DATE) ?>" role="timer" aria-live="off" aria-label="Time remaining until Hubdex Store launches">
                <div class="cd-item"><span class="cd-num" data-unit="days">00</span><span class="cd-label">Days</span></div>
                <div class="cd-item"><span class="cd-num" data-unit="hours">00</span><span class="cd-label">Hours</span></div>
                <div class="cd-item"><span class="cd-num" data-unit="minutes">00</span><span class="cd-label">Minutes</span></div>
                <div class="cd-item"><span class="cd-num" data-unit="seconds">00</span><span class="cd-label">Seconds</span></div>
            </div>

            <form class="notify-form reveal" id="notify" action="subscribe.php" method="post" novalidate>
                <label for="notify-email" class="sr-only">Your e-mail address</label>
                <div class="notify-field">
                    <?= icon('mail', 20) ?>
                    <input type="email" id="notify-email" name="email" placeholder="Enter your e-mail address" autocomplete="email" required maxlength="190">
                    <button type="submit" class="btn btn-primary">
                        <span class="btn-label">Notify Me</span>
                        <?= icon('arrow', 18) ?>
                    </button>
                </div>
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                <div class="hp-field" aria-hidden="true">
                    <label for="notify-website">Website</label>
                    <input type="text" id="notify-website" name="website" tabindex="-1" autocomplete="off">
                </div>
                <p class="form-note">No spam. Only launch news and exclusive early-access offers from Hubdex Store.</p>
                <p class="form-message <?= $notify_status === 'success' || $notify_status === 'exists' ? 'is-success' : ($notify_message ? 'is-error' : '') ?>" role="status" aria-live="polite"><?= e($notify_message) ?></p>
            </form>

            <ul class="social social-hero reveal" aria-label="Follow Hubdex Store">
                <?php foreach ($SOCIAL_LINKS as $network => $link): ?>
                    <li>
                        <a href="<?= e($link) ?>" aria-label="Hubdex Store on <?= e(ucfirst($network === 'x' ? 'X (Twitter)' : $network)) ?>"<?= $link !== '#' ? ' target="_blank" rel="noopener"' : '' ?>>
                            <?= icon($network, 18) ?>
                        </a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>

        <div class="hero-visual reveal" aria-hidden="true">
            <div class="visual-ring"></div>
            <div class="mock-window">
                <div class="mock-bar"><span></span><span></span><span></span><em>hubdexltd.com</em></div>
                <div class="mock-body">
                    <div class="mock-banner">
                        <div>
                            <small>New season</small>
                            <strong>Shop smarter<br>with Hubdex</strong>
                            <span class="mock-pill">Coming soon</span>
                        </div>
                        <div class="mock-banner-art"><img src="assets/img/logo-mark.png" width="76" height="76" alt=""></div>
                    </div>
                    <div class="mock-products">
                        <div class="mock-card"><div class="mock-thumb t1"></div><i></i><i class="short"></i><b></b></div>
                        <div class="mock-card"><div class="mock-thumb t2"></div><i></i><i class="short"></i><b></b></div>
                        <div class="mock-card"><div class="mock-thumb t3"></div><i></i><i class="short"></i><b></b></div>
                    </div>
                </div>
            </div>

            <div class="float-card fc-1">
                <span class="fc-icon"><?= icon('truck', 20) ?></span>
                <div><strong>Fast delivery</strong><small>Tracked orders</small></div>
            </div>
            <div class="float-card fc-2">
                <span class="fc-icon"><?= icon('shield', 20) ?></span>
                <div><strong>Secure checkout</strong><small>Protected payments</small></div>
            </div>
            <div class="float-card fc-3">
                <span class="fc-stars"><?= icon('star', 14) ?><?= icon('star', 14) ?><?= icon('star', 14) ?><?= icon('star', 14) ?><?= icon('star', 14) ?></span>
                <small>Quality you can trust</small>
            </div>
        </div>
    </div>
</section>

<section class="section features" aria-labelledby="features-title">
    <div class="container">
        <div class="section-head reveal">
            <span class="eyebrow">Why Hubdex Store</span>
            <h2 id="features-title">An online store built around trust</h2>
            <p>Hubdex Store LTD is crafting a shopping experience that is simple, secure and dependable from the first click to delivery.</p>
        </div>

        <div class="feature-grid">
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('sparkle', 24) ?></span>
                <h3>Curated quality products</h3>
                <p>Every product on Hubdex will be carefully selected so customers can shop with confidence.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('card', 24) ?></span>
                <h3>Secure payments</h3>
                <p>Encrypted checkout and trusted payment providers to keep every order on Hubdex Store safe.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('truck', 24) ?></span>
                <h3>Reliable delivery</h3>
                <p>Clear delivery times and order tracking, so you always know where your purchase is.</p>
            </article>
            <article class="feature-card reveal">
                <span class="feature-icon"><?= icon('support', 24) ?></span>
                <h3>Friendly support</h3>
                <p>A dedicated Hubdex Store LTD customer care team ready to help before and after every order.</p>
            </article>
        </div>
    </div>
</section>

<section class="section progress-section" aria-labelledby="progress-title">
    <div class="container progress-grid">
        <div class="reveal">
            <span class="eyebrow">Development progress</span>
            <h2 id="progress-title">What we're building at Hubdex</h2>
            <p>Hubdex Store is currently under active development. Here is a snapshot of how the launch of our ecommerce platform is coming together.</p>
            <a class="btn btn-ghost" href="about.php">Learn more about Hubdex Store <?= icon('arrow', 18) ?></a>
        </div>

        <div class="progress-list reveal">
            <?php
            $milestones = [
                ['Brand &amp; platform design', 100],
                ['Online store &amp; product catalogue', 75],
                ['Secure checkout &amp; payments', 60],
                ['Supplier &amp; delivery partners', 45],
            ];
            foreach ($milestones as [$label, $pct]): ?>
                <div class="progress-item">
                    <div class="progress-label"><h3><?= $label ?></h3><span><?= (int) $pct ?>%</span></div>
                    <div class="progress-track"><span class="progress-bar" style="--w: <?= (int) $pct ?>%"></span></div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<section class="section faq" aria-labelledby="faq-title">
    <div class="container narrow">
        <div class="section-head reveal">
            <span class="eyebrow">FAQ</span>
            <h2 id="faq-title">Questions about Hubdex Store</h2>
        </div>

        <div class="faq-list">
            <details class="faq-item reveal" open>
                <summary><h3>What is Hubdex Store?</h3></summary>
                <p>Hubdex Store is an upcoming ecommerce website and online shopping platform operated by Hubdex Store LTD. It will let customers discover, order and shop quality products online.</p>
            </details>
            <details class="faq-item reveal">
                <summary><h3>When will Hubdex Store launch?</h3></summary>
                <p>Hubdex Store is in its final stages of development. Join the notification list above and you'll be the first to know when our online store goes live.</p>
            </details>
            <details class="faq-item reveal">
                <summary><h3>Who operates Hubdex?</h3></summary>
                <p>Hubdex and the Hubdex Store brand are owned and operated by Hubdex Store LTD, a registered company focused on reliable online retail.</p>
            </details>
            <details class="faq-item reveal">
                <summary><h3>How can I contact Hubdex Store LTD?</h3></summary>
                <p>You can reach our team through the <a href="contact.php">contact page</a> or by e-mail at <a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a>.</p>
            </details>
        </div>
    </div>
</section>

<section class="section cta" aria-labelledby="cta-title">
    <div class="container">
        <div class="cta-card reveal">
            <h2 id="cta-title">Be first in line when Hubdex Store opens</h2>
            <p>Early subscribers get exclusive launch offers from Hubdex Store LTD.</p>
            <a class="btn btn-light" href="#notify">Notify Me <?= icon('arrow', 18) ?></a>
        </div>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
