<?php
/**
 * Hubdex Store - Shared site footer
 */
?>
</main>

<footer class="site-footer">
    <div class="container footer-grid">
        <div class="footer-brand">
            <a class="brand" href="./" aria-label="Hubdex Store home">
                <img class="brand-mark" src="assets/img/favicon.svg" width="40" height="40" alt="">
                <span class="brand-text">Hubdex<span>Store</span></span>
            </a>
            <p>Hubdex Store is a modern online shopping platform by <?= e(COMPANY_LEGAL_NAME) ?>, built to make discovering and ordering quality products simple, secure and enjoyable.</p>
            <ul class="social" aria-label="Hubdex Store on social media">
                <?php foreach ($SOCIAL_LINKS as $network => $link): ?>
                    <li>
                        <a href="<?= e($link) ?>" aria-label="Hubdex Store on <?= e(ucfirst($network === 'x' ? 'X (Twitter)' : $network)) ?>"<?= $link !== '#' ? ' target="_blank" rel="noopener"' : '' ?>>
                            <?= icon($network, 18) ?>
                        </a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>

        <nav class="footer-col" aria-label="Company">
            <h2 class="footer-title">Company</h2>
            <ul>
                <li><a href="./">Home</a></li>
                <li><a href="about.php">About Hubdex Store</a></li>
                <li><a href="contact.php">Contact Us</a></li>
                <li><a href="./#notify">Launch Updates</a></li>
            </ul>
        </nav>

        <nav class="footer-col" aria-label="Legal">
            <h2 class="footer-title">Legal</h2>
            <ul>
                <li><a href="privacy.php">Privacy Policy</a></li>
                <li><a href="terms.php">Terms &amp; Conditions</a></li>
                <li><a href="sitemap.php">Sitemap</a></li>
            </ul>
        </nav>

        <div class="footer-col">
            <h2 class="footer-title">Get in touch</h2>
            <ul class="footer-contact">
                <li><?= icon('mail', 16) ?><a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a></li>
                <?php if (CONTACT_PHONE !== ''): ?>
                    <li><?= icon('phone', 16) ?><a href="tel:<?= e(preg_replace('/[^\d+]/', '', CONTACT_PHONE)) ?>"><?= e(CONTACT_PHONE) ?></a></li>
                <?php endif; ?>
                <?php if (COMPANY_ADDRESS !== ''): ?>
                    <li><?= icon('pin', 16) ?><span><?= e(COMPANY_ADDRESS) ?></span></li>
                <?php endif; ?>
                <li><?= icon('globe', 16) ?><span>Online store &middot; Launching soon</span></li>
            </ul>
        </div>
    </div>

    <div class="container footer-bottom">
        <p>&copy; <?= e(COPYRIGHT_YEAR) ?> <?= e(COMPANY_LEGAL_NAME) ?>. All rights reserved.</p>
        <p class="footer-meta">Hubdex &middot; Hubdex Store &middot; Hubdex Store LTD</p>
    </div>
</footer>

<a href="#top" class="to-top" aria-label="Back to top"><?= icon('arrow', 18) ?></a>

<script src="<?= e(asset('js/main.js')) ?>" defer></script>
</body>
</html>
