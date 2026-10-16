<?php
/** Contact / demo / deletion forms: stateless signed tokens + renderer. */

function form_secret(): string
{
    $f = DATA_DIR . '/.secret';
    if (!is_file($f)) { @file_put_contents($f, bin2hex(random_bytes(32)), LOCK_EX); @chmod($f, 0600); }
    $s = @file_get_contents($f);
    return $s ?: hash('sha256', __FILE__ . php_uname());
}

function form_token(): string
{
    $ts = time();
    return $ts . '.' . hash_hmac('sha256', (string)$ts, form_secret());
}

/** Valid if signed, at least $min seconds old (bots submit instantly) and younger than 24h. */
function form_token_ok(string $tok, int $min = 3): bool
{
    if (!preg_match('/^(\d{9,11})\.([a-f0-9]{64})$/', $tok, $m)) { return false; }
    if (!hash_equals(hash_hmac('sha256', $m[1], form_secret()), $m[2])) { return false; }
    $age = time() - (int)$m[1];
    return $age >= $min && $age <= 86400;
}

function vehicle_ranges(): array { return ['1 - 5', '6 - 20', '21 - 50', '51 - 200', '201 - 500', '500+']; }

/**
 * Render an enquiry form. $type: contact | quote | demo | partner
 */
function render_form(string $type = 'contact'): void
{
    if ($type === 'sales') { $type = 'contact'; }
    $countries = site('countries', []);
    $services = site('interest_options', []);
    $plans = array_values(array_filter(array_map(fn($p) => $p['name'] ?? '', (data('pricing')['plans'] ?? []))));
    $submit = ['contact' => 'Send Message', 'quote' => 'Request My Quote', 'demo' => 'Request a Guided Demo', 'partner' => 'Send Partnership Enquiry'][$type] ?? 'Send';
    $msgLabel = ['contact' => 'Message', 'quote' => 'Tell us about your fleet', 'demo' => 'What would you like to see?', 'partner' => 'Tell us about your business and the partnership you have in mind'][$type];
    $ph = ['contact' => 'How can we help?', 'quote' => 'Vehicle types, routes, countries, and what you want to monitor (location, fuel, cameras, reports).', 'demo' => 'For example fuel monitoring, AI dashcams or fleet reports.', 'partner' => 'Your company, the countries you operate in, and how you would like to work with us.'][$type];
    ?>
<form class="form" id="form-<?= e($type) ?>" action="/api/contact.php" method="post" data-ajax novalidate>
  <input type="hidden" name="form_type" value="<?= e($type) ?>">
  <input type="hidden" name="token" value="<?= e(form_token()) ?>">
  <div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="grid-2">
    <label class="fld"><span>Full Name <b>*</b></span><input type="text" name="full_name" required maxlength="120" autocomplete="name" placeholder="Your full name"></label>
    <label class="fld"><span>Company Name<?= $type === 'partner' ? ' <b>*</b>' : '' ?></span><input type="text" name="company" <?= $type === 'partner' ? 'required' : '' ?> maxlength="160" autocomplete="organization" placeholder="Your company"></label>
    <label class="fld"><span>Email <b>*</b></span><input type="email" name="email" required maxlength="160" autocomplete="email" placeholder="name@company.com"></label>
    <label class="fld"><span>Phone Number / WhatsApp <b>*</b></span><input type="tel" name="phone" required maxlength="40" autocomplete="tel" placeholder="+254 700 000 000"></label>
    <label class="fld"><span>Country <b>*</b></span>
      <select name="country" required autocomplete="country-name"><option value="">Select country</option>
<?php foreach ($countries as $c): ?><option><?= e($c) ?></option><?php endforeach; ?>
      </select></label>
<?php if ($type !== 'partner'): ?>
    <label class="fld"><span>Number of Vehicles</span>
      <select name="vehicles"><option value="">Select range</option>
<?php foreach (vehicle_ranges() as $r): ?><option><?= e($r) ?></option><?php endforeach; ?>
      </select></label>
    <label class="fld full"><span>Interested Service</span>
      <select name="service"><option value="">Select a service</option>
<?php foreach ($services as $s): ?><option><?= e($s) ?></option><?php endforeach; ?>
      </select></label>
<?php else: ?>
    <label class="fld"><span>Partnership type</span>
      <select name="partnership_type"><option value="">Select</option><?php foreach (['Reseller', 'Installer / installation partner', 'Distributor', 'Technology / integration partner', 'Corporate cooperation', 'Other'] as $o): ?><option><?= e($o) ?></option><?php endforeach; ?></select></label>
    <label class="fld full"><span>Company website (optional)</span><input type="text" name="website_url" maxlength="160" placeholder="https://"></label>
<?php endif; ?>
<?php if ($type === 'quote'): ?>
    <label class="fld"><span>Hardware</span><select name="hardware"><option value="">Select</option><option>I need trackers and installation</option><option>I already have trackers</option><option>I am not sure yet</option></select></label>
<?php if ($plans): ?><label class="fld"><span>Plan of interest</span><select name="plan"><option value="">Not sure yet</option><?php foreach ($plans as $pl): ?><option><?= e($pl) ?></option><?php endforeach; ?></select></label><?php endif; ?>
<?php endif; ?>
<?php if ($type === 'demo'): ?>
    <label class="fld full"><span>Preferred demo date / time</span><input type="text" name="preferred_time" maxlength="120" placeholder="e.g. Tuesday afternoon, East Africa Time"></label>
<?php endif; ?>
    <label class="fld full"><span><?= e($msgLabel) ?><?= $type === 'partner' ? ' <b>*</b>' : '' ?></span><textarea name="message" rows="5" maxlength="5000" <?= $type === 'partner' ? 'required' : '' ?> placeholder="<?= e($ph) ?>"></textarea></label>
  </div>
  <label class="check"><input type="checkbox" name="consent" value="1" required> <span>I agree that ITrackZen may contact me about this request. See the <a href="/privacy-policy" target="_blank">Privacy Policy</a>.</span></label>
  <p class="fine">This form sends an enquiry to our team. It does not create a tracking account.</p>
  <div class="form-status" role="status" aria-live="polite"></div>
  <button class="btn btn-primary btn-lg" type="submit"><?= e($submit) ?> <?= icon('arrow') ?></button>
</form>
<?php
}

/** Account / data deletion request form (posts to /api/delete-request.php). */
function render_deletion_form(): void
{
    ?>
<form class="form" id="form-delete" action="/api/delete-request.php" method="post" data-ajax novalidate>
  <input type="hidden" name="token" value="<?= e(form_token()) ?>">
  <div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="grid-2">
    <label class="fld"><span>Full name <b>*</b></span><input type="text" name="full_name" required maxlength="120" autocomplete="name"></label>
    <label class="fld"><span>Email registered on your account <b>*</b></span><input type="email" name="email" required maxlength="160" autocomplete="email" placeholder="name@company.com"></label>
    <label class="fld"><span>Account ID or username</span><input type="text" name="account_id" maxlength="160" placeholder="Helps us find your account faster"></label>
    <label class="fld"><span>Phone / WhatsApp (optional)</span><input type="tel" name="phone" maxlength="40" autocomplete="tel"></label>
    <label class="fld"><span>Company (optional)</span><input type="text" name="company" maxlength="160" autocomplete="organization"></label>
    <label class="fld"><span>I am <b>*</b></span><select name="account_type" required><option value="">Select</option><option value="individual">An individual account holder</option><option value="company_owner">Owner / administrator of a company account</option><option value="company_user">A user of a company account</option></select></label>
    <label class="fld full"><span>What do you want deleted? <b>*</b></span><select name="scope" required><option value="">Select</option><option value="full_account">Delete my account and all associated personal data</option><option value="data_only">Delete some data only and keep my account</option></select></label>
    <label class="fld full"><span>Details (optional)</span><textarea name="details" rows="4" maxlength="3000" placeholder="For partial deletion, tell us which data to remove. Never include your password."></textarea></label>
  </div>
  <label class="check"><input type="checkbox" name="confirm" value="1" required> <span>I confirm that I am the account holder or authorised to request deletion of this account and its data. I understand that deletion is permanent and cannot be undone.</span></label>
  <div class="form-status" role="status" aria-live="polite"></div>
  <button class="btn btn-primary btn-lg" type="submit">Submit deletion request <?= icon('arrow') ?></button>
</form>
<?php
}
