<?php
$m = page_meta('contact');
set_breadcrumbs([['Contact Sales', '/contact-sales']]);
$wa = wa_link('Hello ITrackZen, I would like to speak to sales.');
add_ld(['@type' => 'ContactPage', 'name' => 'Contact ITrackZen Sales', 'url' => abs_url('/contact-sales')]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/contact-sales']);
page_hero($m['h1'], 'Tell us about your fleet and we will recommend the right tracking setup. Most enquiries receive a response within one business day.', 'Contact Sales');
?>
<section class="section">
  <div class="container form-layout">
    <div class="form-card reveal" id="form"><h2>Send a business inquiry</h2><p class="muted">Your message goes directly to our sales team.</p><?php render_form('sales'); ?></div>
    <aside class="side reveal">
      <div class="card contact-card"><h3>Talk to us directly</h3>
        <ul class="contact-list">
          <li><?= icon('mail') ?><div><small>Sales</small><a href="<?= e(mailto(site('emails.sales'), 'ITrackZen sales enquiry')) ?>"><?= e(site('emails.sales')) ?></a></div></li>
          <li><?= icon('mail') ?><div><small>General &amp; partnerships</small><a href="<?= e(mailto(site('emails.info'), 'ITrackZen enquiry')) ?>"><?= e(site('emails.info')) ?></a></div></li>
          <?php if (site('phone')): ?><li><?= icon('headset') ?><div><small>Phone</small><a href="tel:<?= e(preg_replace('/[^+\d]/', '', site('phone'))) ?>"><?= e(site('phone')) ?></a></div></li><?php endif; ?>
          <?php if (site('address')): ?><li><?= icon('building') ?><div><small>Office</small><span><?= e(trim(site('address') . ', ' . site('locality'), ', ')) ?></span></div></li><?php endif; ?>
        </ul>
        <div class="stack">
          <?php if ($wa): ?><a class="btn btn-wa btn-block" href="<?= e($wa) ?>" target="_blank" rel="noopener"><?= icon('whatsapp') ?>Chat on WhatsApp</a><?php endif; ?>
          <a class="btn btn-primary btn-block" href="<?= e(mailto(site('emails.sales'), 'ITrackZen sales enquiry')) ?>"><?= icon('mail') ?>Email Sales</a>
          <a class="btn btn-outline btn-block" href="<?= e(mailto(site('emails.info'), 'ITrackZen enquiry')) ?>"><?= icon('mail') ?>Email Info</a>
        </div>
      </div>
      <div class="card biz"><h3>Business inquiry?</h3><p>Resellers, installers, distributors and enterprise fleets: tell us about your project and we will arrange a call with the right specialist.</p><a class="more" href="/demo">Or request a live demo <?= icon('arrow') ?></a></div>
      <div class="card"><h3>Existing customer?</h3><p>Sign in to your fleet account.</p><a class="btn btn-outline btn-block" href="<?= e(site('client_login_url')) ?>" rel="noopener"><?= icon('login') ?>Client Login</a></div>
    </aside>
  </div>
</section>
<?php layout_end();
