<?php
require_once __DIR__ . '/includes/functions.php';

/*
 * ---------------------------------------------------------------------
 * Contact form handler
 * ---------------------------------------------------------------------
 * Validated messages are stored in /data/messages.csv (protected).
 * To receive e-mails, set MAIL_ENABLED = true in includes/config.php.
 * To connect a CRM / database / SMTP later, replace the code inside
 * handle_contact_submission() - the rest of the page stays the same.
 */
function handle_contact_submission(array $data): bool
{
    $saved = save_submission('messages.csv', [
        'date'    => date('c'),
        'name'    => $data['name'],
        'email'   => $data['email'],
        'phone'   => $data['phone'],
        'message' => $data['message'],
        'ip'      => client_ip(),
    ]);

    $body = "New message from the Hubdex Store contact form\n\n"
          . "Name:    {$data['name']}\n"
          . "Email:   {$data['email']}\n"
          . "Phone:   {$data['phone']}\n\n"
          . "Message:\n{$data['message']}\n";

    $mailed = send_notification('Hubdex Store contact: ' . $data['name'], $body, $data['email']);

    return $saved || (MAIL_ENABLED && $mailed);
}

$errors = [];
$old    = ['name' => '', 'email' => '', 'phone' => '', 'message' => ''];
$status = $_GET['sent'] ?? '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $old = [
        'name'    => clean_input($_POST['name'] ?? '', 100),
        'email'   => strtolower(clean_input($_POST['email'] ?? '', 190)),
        'phone'   => clean_input($_POST['phone'] ?? '', 30),
        'message' => clean_input($_POST['message'] ?? '', 5000),
    ];

    if (!empty($_POST['website'])) {
        // Honeypot triggered - silently accept.
        header('Location: contact.php?sent=1#contact-form', true, 303);
        exit;
    }

    if (!csrf_verify($_POST['csrf_token'] ?? null)) {
        $errors['form'] = 'Your session has expired. Please refresh the page and try again.';
    }
    if (mb_strlen($old['name']) < 2) {
        $errors['name'] = 'Please enter your full name.';
    }
    if (!filter_var($old['email'], FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Please enter a valid e-mail address.';
    }
    if ($old['phone'] !== '' && !preg_match('/^[+()\d\s.\-]{6,30}$/', $old['phone'])) {
        $errors['phone'] = 'Please enter a valid phone number.';
    }
    if (mb_strlen($old['message']) < 10) {
        $errors['message'] = 'Your message should be at least 10 characters.';
    }

    if (!$errors && !rate_limit('contact', 30)) {
        $errors['form'] = 'Please wait a little before sending another message.';
    }

    if (!$errors) {
        if (handle_contact_submission($old)) {
            header('Location: contact.php?sent=1#contact-form', true, 303);
            exit;
        }
        $errors['form'] = 'We could not send your message right now. Please e-mail us directly at ' . CONTACT_EMAIL . '.';
    }
}

$page_title       = 'Contact Hubdex Store | Get in Touch with Hubdex Store LTD';
$page_description = 'Contact Hubdex Store LTD. Send a message to the Hubdex Store team about our upcoming online store, partnerships, suppliers or customer enquiries.';
$page_keywords    = 'contact Hubdex Store, Hubdex contact, Hubdex Store LTD contact, Hubdex customer support, ecommerce, online store';
$page_path        = 'contact.php';
$page_id          = 'contact';
$page_type        = 'ContactPage';
$breadcrumb_name  = 'Contact';

require __DIR__ . '/includes/header.php';
?>

<section class="page-hero" aria-labelledby="page-title">
    <div class="container narrow">
        <nav class="breadcrumb reveal" aria-label="Breadcrumb"><a href="./">Home</a><span>/</span><span aria-current="page">Contact</span></nav>
        <h1 id="page-title" class="reveal">Contact <span class="gradient-text">Hubdex Store</span></h1>
        <p class="lead reveal">Have a question about Hubdex, want to partner with us or become a supplier? The Hubdex Store LTD team would love to hear from you.</p>
    </div>
</section>

<section class="section section-tight" aria-label="Contact details and form">
    <div class="container contact-grid">
        <aside class="contact-info reveal">
            <h2>Talk to the Hubdex team</h2>
            <p>We usually reply within one to two business days. For launch updates, join our <a href="./#notify">notification list</a>.</p>

            <ul class="info-list">
                <li>
                    <span class="info-icon"><?= icon('mail', 20) ?></span>
                    <div><h3>E-mail</h3><a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a></div>
                </li>
                <li>
                    <span class="info-icon"><?= icon('support', 20) ?></span>
                    <div><h3>Customer support</h3><a href="mailto:<?= e(SUPPORT_EMAIL) ?>"><?= e(SUPPORT_EMAIL) ?></a></div>
                </li>
                <?php if (CONTACT_PHONE !== ''): ?>
                <li>
                    <span class="info-icon"><?= icon('phone', 20) ?></span>
                    <div><h3>Phone</h3><a href="tel:<?= e(preg_replace('/[^\d+]/', '', CONTACT_PHONE)) ?>"><?= e(CONTACT_PHONE) ?></a></div>
                </li>
                <?php endif; ?>
                <?php if (COMPANY_ADDRESS !== ''): ?>
                <li>
                    <span class="info-icon"><?= icon('pin', 20) ?></span>
                    <div><h3>Address</h3><span><?= e(COMPANY_ADDRESS) ?></span></div>
                </li>
                <?php endif; ?>
                <li>
                    <span class="info-icon"><?= icon('clock', 20) ?></span>
                    <div><h3>Business hours</h3><span>Monday &ndash; Friday, 9:00 &ndash; 17:00</span></div>
                </li>
            </ul>

            <div class="legal-box">
                <h3>Company</h3>
                <p><strong><?= e(COMPANY_LEGAL_NAME) ?></strong><br>Operator of the Hubdex Store online shopping platform.</p>
            </div>
        </aside>

        <div class="form-card reveal" id="contact-form">
            <?php if ($status === '1'): ?>
                <div class="alert alert-success" role="status">
                    <?= icon('check', 22) ?>
                    <div><strong>Thank you! Your message has been sent.</strong><br>A member of the Hubdex Store team will get back to you soon.</div>
                </div>
            <?php endif; ?>

            <?php if (!empty($errors['form'])): ?>
                <div class="alert alert-error" role="alert"><?= e($errors['form']) ?></div>
            <?php endif; ?>

            <h2>Send us a message</h2>
            <form class="contact-form" action="contact.php#contact-form" method="post" novalidate data-validate>
                <div class="form-row">
                    <div class="field<?= isset($errors['name']) ? ' has-error' : '' ?>">
                        <label for="name">Full name <span aria-hidden="true">*</span></label>
                        <input type="text" id="name" name="name" value="<?= e($old['name']) ?>" placeholder="John Smith" autocomplete="name" required minlength="2" maxlength="100"<?= isset($errors['name']) ? ' aria-invalid="true" aria-describedby="name-error"' : '' ?>>
                        <small class="field-error" id="name-error"><?= e($errors['name'] ?? '') ?></small>
                    </div>
                    <div class="field<?= isset($errors['email']) ? ' has-error' : '' ?>">
                        <label for="email">E-mail address <span aria-hidden="true">*</span></label>
                        <input type="email" id="email" name="email" value="<?= e($old['email']) ?>" placeholder="you@example.com" autocomplete="email" required maxlength="190"<?= isset($errors['email']) ? ' aria-invalid="true" aria-describedby="email-error"' : '' ?>>
                        <small class="field-error" id="email-error"><?= e($errors['email'] ?? '') ?></small>
                    </div>
                </div>

                <div class="field<?= isset($errors['phone']) ? ' has-error' : '' ?>">
                    <label for="phone">Phone number <span class="optional">(optional)</span></label>
                    <input type="tel" id="phone" name="phone" value="<?= e($old['phone']) ?>" placeholder="+44 7000 000000" autocomplete="tel" maxlength="30"<?= isset($errors['phone']) ? ' aria-invalid="true" aria-describedby="phone-error"' : '' ?>>
                    <small class="field-error" id="phone-error"><?= e($errors['phone'] ?? '') ?></small>
                </div>

                <div class="field<?= isset($errors['message']) ? ' has-error' : '' ?>">
                    <label for="message">Message <span aria-hidden="true">*</span></label>
                    <textarea id="message" name="message" rows="6" placeholder="How can Hubdex Store help you?" required minlength="10" maxlength="5000"<?= isset($errors['message']) ? ' aria-invalid="true" aria-describedby="message-error"' : '' ?>><?= e($old['message']) ?></textarea>
                    <small class="field-error" id="message-error"><?= e($errors['message'] ?? '') ?></small>
                </div>

                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                <div class="hp-field" aria-hidden="true">
                    <label for="contact-website">Website</label>
                    <input type="text" id="contact-website" name="website" tabindex="-1" autocomplete="off">
                </div>

                <p class="form-note">By sending this form you agree to our <a href="privacy.php">Privacy Policy</a>.</p>
                <button type="submit" class="btn btn-primary btn-block">
                    <span class="btn-label">Send Message</span> <?= icon('arrow', 18) ?>
                </button>
            </form>
        </div>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
