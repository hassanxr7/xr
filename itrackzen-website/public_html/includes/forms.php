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
 * Render a form. $type: sales | demo | delete
 */
function render_form(string $type = 'sales'): void
{
    $countries = site('countries', []);
    $services = site('interest_options', []);
    $ids = $type . '-';
    $submit = ['sales' => 'Send Inquiry', 'demo' => 'Request My Demo', 'delete' => 'Submit Deletion Request'][$type] ?? 'Send';
    $msgLabel = ['sales' => 'Message', 'demo' => 'What would you like to see in the demo?', 'delete' => 'Details (optional)'][$type] ?? 'Message';
    ?>
<form class="form" id="form-<?= e($type) ?>" action="/api/contact.php" method="post" data-ajax novalidate>
  <input type="hidden" name="form_type" value="<?= e($type) ?>">
  <input type="hidden" name="token" value="<?= e(form_token()) ?>">
  <div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="grid-2">
    <label class="fld"><span>Full Name <b>*</b></span><input type="text" name="full_name" required maxlength="120" autocomplete="name" placeholder="Your full name"></label>
<?php if ($type !== 'delete'): ?>
    <label class="fld"><span>Company Name</span><input type="text" name="company" maxlength="160" autocomplete="organization" placeholder="Your company"></label>
<?php else: ?>
    <label class="fld"><span>Company / Account Name</span><input type="text" name="company" maxlength="160" autocomplete="organization" placeholder="Account or company name"></label>
<?php endif; ?>
    <label class="fld"><span>Email <b>*</b></span><input type="email" name="email" required maxlength="160" autocomplete="email" placeholder="name@company.com"></label>
    <label class="fld"><span>Phone Number / WhatsApp <?= $type !== 'delete' ? '<b>*</b>' : '' ?></span><input type="tel" name="phone" <?= $type !== 'delete' ? 'required' : '' ?> maxlength="40" autocomplete="tel" placeholder="+254 700 000 000"></label>
    <label class="fld"><span>Country <?= $type !== 'delete' ? '<b>*</b>' : '' ?></span>
      <select name="country" <?= $type !== 'delete' ? 'required' : '' ?> autocomplete="country-name"><option value="">Select country</option>
<?php foreach ($countries as $c): ?><option><?= e($c) ?></option><?php endforeach; ?>
      </select></label>
<?php if ($type !== 'delete'): ?>
    <label class="fld"><span>Number of Vehicles</span>
      <select name="vehicles"><option value="">Select range</option>
<?php foreach (vehicle_ranges() as $r): ?><option><?= e($r) ?></option><?php endforeach; ?>
      </select></label>
    <label class="fld full"><span>Interested Service</span>
      <select name="service"><option value="">Select a service</option>
<?php foreach ($services as $s): ?><option><?= e($s) ?></option><?php endforeach; ?>
      </select></label>
<?php endif; ?>
<?php if ($type === 'demo'): ?>
    <label class="fld full"><span>Preferred demo date / time</span><input type="text" name="preferred_time" maxlength="120" placeholder="e.g. Tuesday afternoon, East Africa Time"></label>
<?php endif; ?>
    <label class="fld full"><span><?= e($msgLabel) ?></span><textarea name="message" rows="5" maxlength="5000" placeholder="<?= $type === 'delete' ? 'Tell us which account and data you want deleted.' : 'Tell us about your vehicles, countries and what you want to monitor.' ?>"></textarea></label>
  </div>
<?php if ($type === 'delete'): ?>
  <label class="check"><input type="checkbox" name="confirm" value="1" required> <span>I confirm I am the account holder or authorised to request deletion of this account and data.</span></label>
<?php else: ?>
  <label class="check"><input type="checkbox" name="consent" value="1" required> <span>I agree that ITrackZen may contact me about this request. See the <a href="/privacy-policy" target="_blank">Privacy Policy</a>.</span></label>
<?php endif; ?>
  <div class="form-status" role="status" aria-live="polite"></div>
  <button class="btn btn-primary btn-lg" type="submit"><?= e($submit) ?> <?= icon('arrow') ?></button>
</form>
<?php
}
