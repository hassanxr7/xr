<?php
/**
 * The Guardia — default sections, pages, settings and import sources (used by the installer).
 */
defined('APP') || exit;

function seed_defaults(): void
{
    $now = now();
    $cats = [
        // slug, name, parent slug, description
        ['canada', 'Canada', '', 'News from across Canada: provinces, cities, communities and the people shaping the country.'],
        ['world', 'World', '', 'International news, conflicts, diplomacy and the stories changing the world.'],
        ['us', 'U.S.', '', 'News from the United States: federal government, states and courts.'],
        ['africa', 'Africa', '', 'News from across Africa, including the Horn of Africa and its diaspora.'],
        ['politics', 'Politics', '', 'Elections, parliament, government policy and political analysis.'],
        ['courts', 'Courts & Justice', '', 'Court rulings, sentencings, trials and official justice-system records.'],
        ['sex-offender-cases', 'Sex Offender Cases', 'courts', 'Official court records of people convicted and sentenced for sexual offences, including crimes against children. Based on government sources.'],
        ['crime', 'Crime', 'courts', 'Crime reports, investigations and prosecutions.'],
        ['fraud-corruption', 'Fraud & Corruption', 'courts', 'Fraud, money laundering, bribery and public corruption cases.'],
        ['drugs', 'Drugs & Trafficking', 'courts', 'Drug trafficking and organized crime prosecutions.'],
        ['national-security', 'National Security', 'courts', 'Terrorism, espionage, cybercrime and national security cases.'],
        ['business', 'Business', '', 'Economy, markets, companies, jobs and personal finance.'],
        ['technology', 'Technology', '', 'Tech companies, AI, cybersecurity, science and innovation.'],
        ['health', 'Health', '', 'Health, medicine, public health and wellbeing.'],
        ['sports', 'Sports', '', 'Hockey, football, soccer, basketball and more.'],
        ['culture', 'Culture', '', 'Arts, film, music, books and lifestyle.'],
        ['opinion', 'Opinion', '', 'Columns, analysis and opinion from writers and contributors.'],
    ];
    $ids = [];
    foreach ($cats as $i => [$slug, $name, $parent, $desc]) {
        if ($existing = val('SELECT id FROM categories WHERE slug = ?', [$slug])) {
            $ids[$slug] = (int) $existing;
            continue;
        }
        $ids[$slug] = insert('categories', [
            'name' => $name, 'slug' => $slug, 'description' => $desc, 'parent_id' => $parent ? ($ids[$parent] ?? null) : null,
            'position' => $i, 'in_menu' => $parent ? 0 : 1, 'on_home' => 1, 'created_at' => $now,
        ]);
    }

    $name = site_name();
    $email = setting('contact_email', 'newsroom@theguardia.ca');
    $pages = [
        ['about', 'About us', "<p>$name is an independent digital news publication covering Canada, the United States, Africa and the world since 2015. We report on politics, courts and justice, business, technology, health, sports and culture.</p><h2>What we do</h2><p>Our newsroom publishes original reporting and analysis, and brings readers official public-record information — such as court sentencings published by government justice departments — with clear sourcing and links to the original documents.</p><h2>Contact</h2><p>Email <a href=\"mailto:$email\">$email</a> or use our <a href=\"/contact\">contact form</a>.</p>"],
        ['editorial-standards', 'Editorial standards', "<p>We aim to be accurate, fair and transparent.</p><ul><li><strong>Sourcing.</strong> Every story identifies its sources. Reports based on official releases link to the original document.</li><li><strong>Presumption of innocence.</strong> Charges are allegations. We clearly distinguish between people who are charged, convicted and sentenced.</li><li><strong>Independence.</strong> Advertising never influences our journalism. Sponsored content is always labelled.</li><li><strong>AI assistance.</strong> Editors may use AI tools to help draft or structure stories from facts they have gathered. A human editor checks every fact before publication.</li><li><strong>Copyright.</strong> We only republish material that is in the public domain or under an open licence, with attribution.</li></ul>"],
        ['corrections', 'Corrections policy', "<p>When we get something wrong, we correct it promptly and say so at the bottom of the story.</p><p>To request a correction or the review of a court-record story (for example if a conviction was overturned or a record was sealed), email <a href=\"mailto:$email\">$email</a> with the link to the story and supporting documents. We respond within 3 business days.</p>"],
        ['privacy', 'Privacy policy', "<p>This policy explains what information $name collects and why.</p><h2>Analytics</h2><p>We count page views to understand which stories readers find useful. We record the page, the referring website (for example Facebook or Google), your approximate location (country and city, derived from your IP address, which is not stored), and the type of device. Visitors are counted with a random identifier stored in your browser.</p><h2>Advertising</h2><p>We use Google AdSense to show ads. Google and its partners may use cookies to show ads based on your visits to this and other websites. You can opt out of personalised advertising at <a href=\"https://adssettings.google.com\" rel=\"nofollow noopener\">Google Ads Settings</a>. See <a href=\"https://policies.google.com/technologies/partner-sites\" rel=\"nofollow noopener\">how Google uses information from sites that use its services</a>.</p><h2>News alerts</h2><p>If you turn on push alerts, your browser gives us an anonymous delivery address. You can turn alerts off at any time in your browser settings.</p><h2>Photo store</h2><p>If you buy a photo licence, we keep your name, email and organisation to deliver and document the licence. Payments are processed by Stripe; we never see your card details.</p><h2>Contact</h2><p>Questions: <a href=\"mailto:$email\">$email</a>.</p><p class=\"small\">IP geolocation by <a href=\"https://db-ip.com\">DB-IP</a>.</p>"],
        ['terms', 'Terms of use', "<p>By using this website you agree to these terms.</p><ul><li>Content © $name unless otherwise stated. Public-domain and openly licensed material is identified at the end of each story and remains under its original licence.</li><li>You may share links to our stories. Republishing our original stories requires written permission.</li><li>Photos in the photo store are licensed under the terms shown at purchase.</li><li>We are not responsible for the content of external websites we link to.</li></ul>"],
        ['advertise', 'Advertise with us', "<p>Reach readers across Canada, the United States and the diaspora communities we serve. We offer display banners on the home page, in sections and inside stories, and sponsored placements.</p><p>Contact <a href=\"mailto:$email\">$email</a> for rates and audience figures.</p>"],
    ];
    foreach ($pages as [$slug, $title, $body]) {
        if (!val('SELECT id FROM pages WHERE slug = ?', [$slug])) {
            insert('pages', ['title' => $title, 'slug' => $slug, 'body' => $body, 'in_footer' => 1, 'updated_at' => $now]);
        }
    }

    $defaults = [
        'tagline' => 'Independent news since 2015',
        'site_description' => 'Breaking news, court reports and in-depth journalism from Canada, the United States, Africa and around the world.',
        'founding_year' => '2015',
        'timezone' => 'America/Toronto',
        'page_cache_ttl' => '120',
        'sitemap_size' => '50000',
        'in_article_after' => '3',
        'ads_enabled' => '1',
        'indexnow_enabled' => '1',
        'indexnow_key' => bin2hex(random_bytes(16)),
        'analytics_retention_days' => '120',
        'ai_model' => 'claude-opus-5-5',
        'ai_effort' => 'medium',
        'store_currency' => 'CAD',
        'download_days' => '7',
        'download_limit' => '5',
        'admin_lang' => 'en',
        'cron_key' => token(18),
    ];
    foreach ($defaults as $k => $v) {
        if (setting($k) === '') {
            save_setting($k, $v);
        }
    }

    // Official / openly licensed sources (disabled until an editor turns them on, except the DOJ).
    $sources = [
        ['doj', 'U.S. Department of Justice – press releases', 'https://www.justice.gov/api/v1/press_releases.json?pagesize=50&sort=date&direction=DESC&page={page}',
            'Public domain (U.S. government work, 17 U.S.C. § 105)', 'courts', 1, 'source'],
        ['rss', 'The Conversation Canada – Politics', 'https://theconversation.com/ca/politics/articles.atom', 'CC BY-ND 4.0 (republish unedited, with credit)', 'politics', 0, 'source'],
        ['rss', 'The Conversation Canada – all', 'https://theconversation.com/ca/articles.atom', 'CC BY-ND 4.0 (republish unedited, with credit)', 'canada', 0, 'source'],
        ['rss', 'Global Voices', 'https://globalvoices.org/feed/?paged={page}', 'CC BY 3.0 (credit the author and Global Voices)', 'world', 0, 'source'],
        ['rss', 'KFF Health News', 'https://kffhealthnews.org/feed/?paged={page}', 'CC BY-ND 4.0 (republish unedited, with credit)', 'health', 0, 'source'],
        ['rss', 'Stateline – U.S. state politics', 'https://stateline.org/feed/?paged={page}', 'CC BY-ND 4.0 (republish unedited, with credit)', 'us', 0, 'source'],
        ['rss', 'NASA – news releases', 'https://www.nasa.gov/news-release/feed/', 'Public domain (NASA content; images may differ)', 'technology', 0, 'source'],
    ];
    foreach ($sources as [$type, $sname, $surl, $licence, $cat, $enabled, $canonical]) {
        if (!val('SELECT id FROM import_sources WHERE url = ?', [$surl])) {
            insert('import_sources', [
                'type' => $type, 'name' => $sname, 'url' => $surl, 'licence' => $licence, 'category_id' => $ids[$cat] ?? null,
                'auto_classify' => $type === 'doj' ? 1 : 0, 'since' => '2015-01-01', 'canonical' => $canonical, 'enabled' => $enabled, 'created_at' => $now,
            ]);
        }
    }
}
