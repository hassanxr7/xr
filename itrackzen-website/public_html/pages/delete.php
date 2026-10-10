<?php
$m = page_meta('delete');
set_breadcrumbs([['Account & Data Deletion', '/delete-account']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/delete-account']);
page_hero($m['h1'], 'You can ask us to delete your ITrackZen account and the personal data linked to it. This page applies to the website, the web platform and the ITrackZen mobile apps.', 'Privacy');
?>
<section class="section"><div class="container form-layout">
  <div class="form-card reveal"><h2>Request deletion</h2><p class="muted">We will verify your identity by email before deleting anything.</p><?php render_form('delete'); ?></div>
  <aside class="side reveal">
    <div class="card"><h3>How deletion works</h3>
      <ol class="num-list"><li>Submit this form, or email <a href="<?= e(mailto(site('emails.info'), 'Account deletion request')) ?>"><?= e(site('emails.info')) ?></a> from your registered address.</li><li>We confirm your identity and the account concerned.</li><li>We delete or anonymise your account, profile and associated personal data.</li><li>We confirm by email when it is done.</li></ol></div>
    <div class="card"><h3>What is deleted and kept</h3><p>Deleted: your profile, login credentials, saved settings and personal contact details. Some records may be kept for a limited time where the law requires it, for example invoices, security logs and fraud prevention.</p><p>If your tracking data belongs to your employer or fleet owner, they control it, and we may redirect your request to them. See the <a href="/privacy-policy">Privacy Policy</a>.</p></div>
  </aside>
</div></section>
<?php layout_end();
