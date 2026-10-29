<?php
/**
 * The Guardia — AI newsroom.
 *
 * Three Claude agents work as a pipeline, one step per run (cron or the "Run now" button):
 *   Alex        — research: searches reputable outlets worldwide (web search), picks trending and
 *                 regular stories, gathers facts with their sources.
 *   Kristov Joi — writing: turns Alex's research into an original, engaging story with headline,
 *                 subtitle, SEO fields and tags; finds a free-licence photo (Openverse) or, if allowed,
 *                 generates a labelled illustration.
 *   David Mario — review: fact-checks the draft against the sources (web search), fixes small
 *                 problems or sends it back, rejects risky stories, and publishes approved ones.
 * The owner chats with the newsroom from the dashboard; messages become assignments for Alex.
 */
defined('APP') || exit;

const AGENTS = [
    'alex'    => ['name' => 'Alex', 'slug' => 'alex', 'title' => 'AI research editor',
        'bio' => 'Alex is the AI research agent of our newsroom. Alex follows reputable news outlets around the world, compares their reporting and selects the stories our readers need to know about.'],
    'kristov' => ['name' => 'Kristov Joi', 'slug' => 'kristov-joi', 'title' => 'AI writer',
        'bio' => 'Kristov Joi is the AI writing agent of our newsroom. Kristov turns verified research into clear, engaging stories, always citing the original reporting.'],
    'david'   => ['name' => 'David Mario', 'slug' => 'david-mario', 'title' => 'AI fact-checking editor',
        'bio' => 'David Mario is the AI fact-checking editor of our newsroom. David checks every claim against its sources before a story is published, and rejects anything that cannot be verified.'],
];

function newsroom_enabled(): bool
{
    return setting('ai_newsroom_enabled', '0') === '1' && ai_enabled();
}

/** User account for an agent (created on first use; it can never sign in). */
function newsroom_agent_user(string $key): int
{
    $a = AGENTS[$key];
    $email = $a['slug'] . '@agents.invalid';
    $id = (int) val('SELECT id FROM users WHERE email = ?', [$email]);
    if (!$id) {
        $id = insert('users', [
            'name' => $a['name'], 'email' => $email, 'password_hash' => password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT),
            'role' => 'writer', 'slug' => unique_slug('users', $a['slug']), 'title' => $a['title'], 'bio' => $a['bio'], 'created_at' => now(),
        ]);
    }
    return $id;
}

function newsroom_say(string $sender, string $body, ?int $jobId = null): void
{
    // Don't repeat the same system problem (e.g. a wrong API key) more than once an hour.
    if ($sender === 'system' && val('SELECT 1 FROM ai_messages WHERE sender = ? AND body = ? AND created_at >= ?', ['system', mb_substr($body, 0, 4000), date('Y-m-d H:i:s', time() - 3600)])) {
        return;
    }
    insert('ai_messages', ['sender' => $sender, 'body' => mb_substr($body, 0, 4000), 'job_id' => $jobId, 'user_id' => $sender === 'owner' ? (user()['id'] ?? null) : null, 'created_at' => now()]);
}

function newsroom_assign(string $brief): int
{
    $brief = trim($brief);
    newsroom_say('owner', $brief);
    $id = insert('ai_assignments', ['brief' => mb_substr($brief, 0, 2000), 'status' => 'open', 'created_by' => user()['id'] ?? null, 'created_at' => now()]);
    newsroom_say('alex', 'Got it — I am starting on this now. I will post here what I find, then Kristov writes and David checks before anything is published.');
    return $id;
}

/** Today's target (a random number between the configured minimum and maximum, fixed for the day). */
function newsroom_target_today(): int
{
    $key = 'ai_target_' . date('Ymd');
    if (setting($key) === '') {
        $min = max(1, (int) setting('ai_daily_min', '7'));
        $max = max($min, (int) setting('ai_daily_max', '20'));
        save_setting($key, (string) random_int($min, $max));
    }
    return (int) setting($key);
}

function newsroom_published_today(): int
{
    return (int) val("SELECT COUNT(*) FROM ai_jobs WHERE stage = 'published' AND updated_at >= ?", [date('Y-m-d 00:00:00')]);
}

/** How many stories should be out by now: the daily target spread evenly between 06:00 and 22:00. */
function newsroom_due(): int
{
    $start = strtotime(date('Y-m-d 06:00:00'));
    $end = strtotime(date('Y-m-d 22:00:00'));
    $frac = max(0, min(1, (time() - $start) / ($end - $start)));
    return (int) ceil(newsroom_target_today() * $frac);
}

function newsroom_sections(): array
{
    $allowed = array_filter(array_map('intval', explode(',', setting('ai_sections'))));
    $out = [];
    foreach (categories() as $c) {
        if (!$allowed || in_array((int) $c['id'], $allowed, true)) {
            $out[] = $c['name'];
        }
    }
    return $out;
}

/**
 * Agent loop for one task: the model may use server-side web tools, then must call $submit.
 * Handles pause_turn (long server-side searches) and a missing final call.
 */
function agent_run(string $system, string $task, array $submitTool, bool $web, string $effort = 'medium', int $maxTokens = 16000, int $searches = 8, int $fetches = 5): array
{
    $tools = [];
    if ($web) {
        $tools[] = ['type' => 'web_search_20260209', 'name' => 'web_search', 'max_uses' => $searches];
        $tools[] = ['type' => 'web_fetch_20260209', 'name' => 'web_fetch', 'max_uses' => $fetches];
    }
    $submitTool['strict'] = true;
    $tools[] = $submitTool;
    $messages = [['role' => 'user', 'content' => $task]];
    $nudged = false;
    for ($round = 0; $round < 6; $round++) {
        [$data, $raw] = ai_http([
            'model' => setting('ai_model', 'claude-opus-5-5'),
            'max_tokens' => $maxTokens,
            'system' => $system,
            'messages' => $messages,
            'tools' => $tools,
            'tool_choice' => ['type' => 'auto'],
            'output_config' => ['effort' => $effort],
        ], true, 540);
        $stop = $data['stop_reason'] ?? '';
        if ($stop === 'refusal') {
            throw new RuntimeException('The model declined this task.');
        }
        foreach ($data['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && ($block['name'] ?? '') === $submitTool['name']) {
                return is_array($block['input']) ? $block['input'] : [];
            }
        }
        // Send the assistant turn back unchanged (thinking and search blocks included).
        $messages[] = ['role' => 'assistant', 'content' => $raw->content];
        if ($stop === 'pause_turn') {
            continue; // server-side search loop paused: resend and it resumes
        }
        if ($stop === 'max_tokens' || $nudged) {
            throw new RuntimeException('The agent did not finish its task (' . ($stop ?: 'no result') . ').');
        }
        $messages[] = ['role' => 'user', 'content' => 'Now call the ' . $submitTool['name'] . ' tool with your final result.'];
        $nudged = true;
    }
    throw new RuntimeException('The agent took too many steps.');
}

/** Closed JSON-schema object helper (every property required, no extras — needed for strict tools). */
function schema_obj(array $props): array
{
    return ['type' => 'object', 'additionalProperties' => false, 'required' => array_keys($props), 'properties' => $props];
}

// ---------------------------------------------------------------------------
// Alex — research
// ---------------------------------------------------------------------------

function alex_research(?array $assignment): int
{
    newsroom_status('Alex is searching news sources' . ($assignment ? ' for your request' : '') . '…');
    $s = ['type' => 'string'];
    $tool = [
        'name' => 'submit_research',
        'description' => 'Hand the selected stories, with facts and sources, to the writer.',
        'input_schema' => schema_obj([
            'stories' => ['type' => 'array', 'items' => schema_obj([
                'headline_idea' => $s,
                'section' => $s,
                'interest' => ['type' => 'string', 'enum' => ['trending', 'regular']],
                'angle' => $s,
                'summary' => $s,
                'key_facts' => ['type' => 'array', 'items' => schema_obj(['fact' => $s, 'source_url' => $s])],
                'quotes' => ['type' => 'array', 'items' => schema_obj(['quote' => $s, 'speaker' => $s, 'source_url' => $s])],
                'sources' => ['type' => 'array', 'items' => schema_obj(['outlet' => $s, 'title' => $s, 'url' => $s])],
                'location' => $s,
                'image_query' => $s,
                'sensitivity' => $s,
            ])],
            'note_to_team' => $s,
        ]),
    ];
    $since = date('Y-m-d H:i:s', time() - 4 * 86400);
    $recent = array_values(array_unique(array_merge(
        array_column(rows('SELECT title FROM articles WHERE created_at >= ? ORDER BY id DESC LIMIT 80', [$since]), 'title'),
        array_column(rows('SELECT topic FROM ai_jobs WHERE created_at >= ? ORDER BY id DESC LIMIT 60', [$since]), 'topic') // includes rejected ideas
    )));
    $site = site_name();
    $system = "You are Alex, the research editor of {$site}, an independent online news site for readers in Canada, the U.S., Africa (including the Somali diaspora) and worldwide.\n"
        . "Your job: find today's stories worth publishing and hand verified facts to the writer.\n"
        . "Method: use web_search and web_fetch on reputable outlets (wire services, public broadcasters, major newspapers, official government and court sites). "
        . "Prefer news from the last 24–48 hours. Mix stories with high reader interest (likely to be widely read and shared) with solid regular news across sections.\n"
        . "Rules:\n- Every key fact must have the URL of the source where you read it. Each story needs at least two independent reputable sources, or one official primary source (government, court, police, company statement).\n"
        . "- Record facts in your own words; never copy paragraphs. Quotes only word for word from a source, with the speaker and URL.\n"
        . "- Skip: rumours, unverified social-media claims, stories naming private people accused of crimes without official charges, anything identifying minors or victims of sexual crimes, celebrity gossip without news value, stories we already covered.\n"
        . "- Note anything sensitive (ongoing trials, elections, health claims, conflicts) in 'sensitivity'.\n"
        . "- image_query: 2–4 plain English words describing a generic photo that would suit the story (places, objects, buildings — not specific private people).\n"
        . "- section must be one of: " . implode(', ', newsroom_sections()) . ".\n"
        . (setting('ai_focus') !== '' ? "Editorial focus from the owner: " . setting('ai_focus') . "\n" : '')
        . "When finished, call submit_research.";
    $want = $assignment ? '1 to 4 stories that answer the owner\'s request' : max(1, min(4, newsroom_target_today() - newsroom_published_today())) . ' stories';
    $task = "Today is " . date('l, F j, Y, H:i T') . ".\nFind $want.\n"
        . ($assignment ? "<owner_request>\n" . $assignment['brief'] . "\n</owner_request>\n" : '')
        . "Already published recently (do not repeat):\n- " . implode("\n- ", array_slice($recent, 0, 140) ?: ['(none)']);
    // More searches when the cron job runs it (no time limit) than from a web request.
    $out = agent_run($system, $task, $tool, true, 'medium', 16000, PHP_SAPI === 'cli' ? 14 : 6, PHP_SAPI === 'cli' ? 8 : 4);
    $n = 0;
    foreach ($out['stories'] ?? [] as $st) {
        $idea = trim((string) ($st['headline_idea'] ?? ''));
        if ($idea === '' || count($st['sources'] ?? []) < 1) {
            continue;
        }
        foreach ($recent as $t) {
            similar_text(mb_strtolower($t), mb_strtolower($idea), $pct);
            if ($pct > 72) {
                continue 2;
            }
        }
        $jobId = insert('ai_jobs', ['assignment_id' => $assignment['id'] ?? null, 'topic' => mb_substr($idea, 0, 250), 'stage' => 'researched',
            'research' => json_encode($st, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'created_at' => now(), 'updated_at' => now()]);
        newsroom_say('alex', 'New story for Kristov: “' . $idea . '” (' . ($st['section'] ?? '') . ', ' . ($st['interest'] ?? 'regular') . ', ' . count($st['sources']) . ' sources).', $jobId);
        $recent[] = $idea;
        $n++;
    }
    if ($assignment) {
        update('ai_assignments', ['status' => 'done', 'done_at' => now()], 'id = ?', [$assignment['id']]);
    }
    $note = trim((string) ($out['note_to_team'] ?? ''));
    newsroom_say('alex', ($n ? "I passed $n stor" . ($n === 1 ? 'y' : 'ies') . ' to Kristov.' : 'I did not find a new story that meets our sourcing rules this time.') . ($note !== '' ? ' ' . $note : ''));
    return $n;
}

// ---------------------------------------------------------------------------
// Kristov Joi — writing (+ image)
// ---------------------------------------------------------------------------

function kristov_write(array $job): void
{
    newsroom_status('Kristov Joi is writing “' . $job['topic'] . '”…', (int) $job['id']);
    $research = json_decode((string) $job['research'], true) ?: [];
    $review = json_decode((string) $job['review'], true) ?: [];
    $schema = ai_story_schema();
    $schema['properties']['image_prompt'] = ['type' => 'string', 'description' => 'Description of an editorial illustration for the story: no text, no logos, no real identifiable people.'];
    $schema['required'][] = 'image_prompt';
    $site = site_name();
    $system = ai_system_prompt() . "\n\nYou are Kristov Joi, the writer of {$site}'s newsroom. You write original stories from the research Alex gives you.\n"
        . "Make it compelling to read: a strong, accurate first paragraph; vivid but precise language; context that explains why it matters; what happens next. Never sensationalise.\n"
        . "Write in your own words — never copy sentences from the sources. Attribute facts to the outlets that reported them (\"Reuters reported\", \"according to the BBC\") and link the outlet name to the source URL with <a href>.\n"
        . "Length 450–800 words, with <h2> subheadings. The standfirst is an inviting one- or two-sentence subtitle.";
    $task = "Write this story.\n<research>\n" . json_encode($research, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n</research>\n"
        . ($job['stage'] === 'revise' ? "<editor_notes>\nDavid Mario sent the draft back. Fix these points:\n" . ($review['revise_notes'] ?? '') . "\n" . implode("\n", (array) ($review['issues'] ?? [])) . "\n</editor_notes>\n" : '')
        . "Available sections: " . implode(', ', newsroom_sections()) . ". Today: " . date('F j, Y') . '.';
    $data = ai_http([
        'model' => setting('ai_model', 'claude-opus-5-5'),
        'max_tokens' => 16000,
        'system' => $system,
        'messages' => [['role' => 'user', 'content' => $task]],
        'output_config' => ['effort' => 'medium', 'format' => ['type' => 'json_schema', 'schema' => $schema]],
    ]);
    if (($data['stop_reason'] ?? '') === 'refusal') {
        throw new RuntimeException('The writer declined this story.');
    }
    $text = '';
    foreach ($data['content'] ?? [] as $b) {
        if (($b['type'] ?? '') === 'text') {
            $text .= $b['text'];
        }
    }
    $story = json_decode($text, true);
    if (!is_array($story) || empty($story['headline']) || empty($story['body_html'])) {
        throw new RuntimeException('The draft could not be read.');
    }
    $story['body_html'] = sanitize_html((string) $story['body_html']);
    // Keep the image chosen in an earlier round; otherwise find one now.
    $old = json_decode((string) $job['draft'], true) ?: [];
    $story['image_id'] = $old['image_id'] ?? newsroom_find_image((string) ($research['image_query'] ?? ''), (string) ($story['image_prompt'] ?? ''), (string) $story['headline']);
    update('ai_jobs', ['stage' => 'written', 'draft' => json_encode($story, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'updated_at' => now()], 'id = ?', [$job['id']]);
    newsroom_say('kristov', 'Draft ready for David: “' . $story['headline'] . '” (' . str_word_count(plain_text($story['body_html'])) . ' words'
        . ($story['image_id'] ? ', with photo' : ', no photo found — section image will be used') . ').', (int) $job['id']);
}

/**
 * A photo for a story: first a free-licence photo from Openverse (CC0, public domain, CC BY, CC BY-SA),
 * then — only if an image-generation key is configured — an AI illustration, clearly labelled.
 */
function newsroom_find_image(string $query, string $prompt, string $title): ?int
{
    $query = trim($query);
    if ($query !== '') {
        $r = http_request('GET', 'https://api.openverse.org/v1/images/?' . http_build_query([
            'q' => $query, 'license' => 'cc0,pdm,by,by-sa', 'page_size' => 20, 'mature' => 'false',
        ]), ['Accept: application/json'], null, 25);
        $res = json_decode($r['body'], true)['results'] ?? [];
        foreach ($res as $img) {
            $w = (int) ($img['width'] ?? 0);
            $h = (int) ($img['height'] ?? 0);
            if ($w < 1000 || !$h || $w / $h < 1.2 || $w / $h > 2.2 || empty($img['url'])) {
                continue;
            }
            $tmp = tempnam(sys_get_temp_dir(), 'tgimg');
            $d = http_request('GET', (string) $img['url'], [], null, 40);
            if ($d['status'] !== 200 || strlen($d['body']) < 20000) {
                @unlink($tmp);
                continue;
            }
            file_put_contents($tmp, $d['body']);
            try {
                $licence = strtoupper((string) $img['license']) === 'PDM' ? 'Public domain' : 'CC ' . strtoupper((string) $img['license']) . ' ' . ($img['license_version'] ?? '');
                $credit = trim(($img['creator'] ?? 'Unknown') . ' / ' . ($img['source'] ?? 'Openverse') . ' (' . trim($licence) . ')');
                $id = media_save_file($tmp, $query . '.jpg', [
                    'alt' => mb_substr((string) ($img['title'] ?? $query), 0, 200),
                    'caption' => 'Illustrative photo: ' . mb_substr((string) ($img['title'] ?? $query), 0, 200) . '. Licence: ' . ($img['license_url'] ?? '') . ' Source: ' . ($img['foreign_landing_url'] ?? ''),
                    'credit' => mb_substr($credit, 0, 120),
                ]);
                @unlink($tmp);
                return $id;
            } catch (Throwable $e) {
                @unlink($tmp);
            }
        }
    }
    if (setting('ai_image_key') !== '' && trim($prompt) !== '') {
        try {
            $r = http_request('POST', 'https://api.openai.com/v1/images/generations', ['Content-Type: application/json', 'Authorization: Bearer ' . setting('ai_image_key')], json_encode([
                'model' => setting('ai_image_model', 'gpt-image-1'),
                'prompt' => 'Editorial illustration for a news website article titled "' . $title . '". ' . $prompt
                    . ' Style: modern editorial illustration, muted natural colours, no text, no letters, no logos, no identifiable real people, not a realistic photo of a real event.',
                'size' => '1536x1024',
                'n' => 1,
            ]), 180);
            $b64 = json_decode($r['body'], true)['data'][0]['b64_json'] ?? '';
            if ($r['status'] === 200 && $b64 !== '') {
                $tmp = tempnam(sys_get_temp_dir(), 'tggen');
                file_put_contents($tmp, base64_decode($b64));
                $id = media_save_file($tmp, slugify($title, 40) . '-illustration.png', [
                    'alt' => 'Illustration: ' . mb_substr($title, 0, 180), 'caption' => 'AI-generated illustration.', 'credit' => 'AI-generated illustration',
                ]);
                @unlink($tmp);
                return $id;
            }
            log_error('Image generation: HTTP ' . $r['status'] . ' ' . mb_substr($r['body'], 0, 300));
        } catch (Throwable $e) {
            log_error('Image generation: ' . $e->getMessage());
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// David Mario — review & publish
// ---------------------------------------------------------------------------

function david_review(array $job): void
{
    newsroom_status('David Mario is fact-checking “' . $job['topic'] . '”…', (int) $job['id']);
    $research = json_decode((string) $job['research'], true) ?: [];
    $draft = json_decode((string) $job['draft'], true) ?: [];
    $s = ['type' => 'string'];
    $tool = [
        'name' => 'submit_review',
        'description' => 'Give the final editorial decision on the draft.',
        'input_schema' => schema_obj([
            'decision' => ['type' => 'string', 'enum' => ['approve', 'revise', 'reject']],
            'confidence' => ['type' => 'integer', 'description' => '0–100: how sure you are that every claim is accurate'],
            'checks' => ['type' => 'array', 'items' => schema_obj(['claim' => $s, 'status' => ['type' => 'string', 'enum' => ['verified', 'unverified', 'wrong']], 'note' => $s])],
            'issues' => ['type' => 'array', 'items' => $s],
            'fixed_headline' => ['type' => 'string', 'description' => 'Corrected headline, or empty string to keep it'],
            'fixed_standfirst' => ['type' => 'string', 'description' => 'Corrected subtitle, or empty string'],
            'fixed_body_html' => ['type' => 'string', 'description' => 'Full corrected body HTML if you fixed small errors, or empty string'],
            'revise_notes' => ['type' => 'string', 'description' => 'What the writer must change (when decision is revise)'],
            'note_to_team' => $s,
        ]),
    ];
    $system = "You are David Mario, the fact-checking editor of " . site_name() . ". Nothing is published without your approval.\n"
        . "Check the draft against the research sources, and use web_search / web_fetch to verify the most important claims (names, numbers, dates, outcomes, quotes).\n"
        . "Decide:\n- approve: every key claim is supported by the sources; tone is fair; no legal risk. Small fixes (a wrong number, a spelling of a name, an overstatement) — make them yourself in fixed_* fields and approve.\n"
        . "- revise: the story is sound but needs real changes by the writer (explain in revise_notes).\n"
        . "- reject: a key claim cannot be verified by two independent reputable sources or one official source; the story is outdated or duplicates another; "
        . "it names a private person as a suspect without official charges; it could identify a minor or a victim of sexual crime; it is copied from a source; it spreads health, election or conflict misinformation.\n"
        . "Also reject clickbait headlines that the story does not support. Be strict: a rejected story costs nothing, a wrong one damages the newspaper.";
    $task = "<research>\n" . json_encode($research, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n</research>\n<draft>\nHEADLINE: " . ($draft['headline'] ?? '')
        . "\nSUBTITLE: " . ($draft['standfirst'] ?? '') . "\nBODY:\n" . ($draft['body_html'] ?? '') . "\n</draft>\nToday: " . date('F j, Y H:i T') . '. Review it, then call submit_review.';
    $review = agent_run($system, $task, $tool, true, 'high', 16000, 5, 3);
    $decision = $review['decision'] ?? 'reject';
    if ($decision === 'approve' && (int) ($review['confidence'] ?? 0) < (int) setting('ai_min_confidence', '75')) {
        $decision = 'reject';
        $review['issues'][] = 'Confidence below the required level.';
    }
    if ($decision === 'revise' && (int) $job['attempts'] >= 1) {
        $decision = 'reject'; // one rewrite only
        $review['issues'][] = 'Still not ready after one revision.';
    }
    $reviewJson = json_encode($review, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($decision === 'revise') {
        update('ai_jobs', ['stage' => 'revise', 'review' => $reviewJson, 'attempts' => (int) $job['attempts'] + 1, 'updated_at' => now()], 'id = ?', [$job['id']]);
        newsroom_say('david', 'Sent back to Kristov: ' . str_limit((string) ($review['revise_notes'] ?? implode(' ', (array) $review['issues'])), 400), (int) $job['id']);
        return;
    }
    if ($decision !== 'approve') {
        update('ai_jobs', ['stage' => 'rejected', 'review' => $reviewJson, 'updated_at' => now()], 'id = ?', [$job['id']]);
        newsroom_say('david', 'Rejected “' . ($draft['headline'] ?? $job['topic']) . '”: ' . (str_limit(implode(' ', (array) ($review['issues'] ?? [])), 400) ?: 'it did not meet our standards.'), (int) $job['id']);
        return;
    }
    foreach (['headline' => 'fixed_headline', 'standfirst' => 'fixed_standfirst', 'body_html' => 'fixed_body_html'] as $k => $f) {
        if (trim((string) ($review[$f] ?? '')) !== '') {
            $draft[$k] = $review[$f];
        }
    }
    $articleId = newsroom_publish($job, $research, $draft);
    $a = article($articleId);
    update('ai_jobs', ['stage' => 'published', 'review' => $reviewJson, 'article_id' => $articleId, 'updated_at' => now()], 'id = ?', [$job['id']]);
    $live = $a['status'] === 'published';
    newsroom_say('david', ($live ? 'Approved and published: ' : 'Approved — waiting for your review in Stories: ') . '“' . $a['title'] . '” ' . article_url($a, true)
        . ' (confidence ' . (int) ($review['confidence'] ?? 0) . '%).', (int) $job['id']);
}

function newsroom_publish(array $job, array $research, array $draft): int
{
    $cat = null;
    foreach (categories() as $c) {
        if (strcasecmp($c['name'], (string) ($research['section'] ?? $draft['category_hint'] ?? '')) === 0 || strcasecmp($c['name'], (string) ($draft['category_hint'] ?? '')) === 0) {
            $cat = (int) $c['id'];
            break;
        }
    }
    $sources = array_values(array_filter((array) ($research['sources'] ?? []), fn ($s) => filter_var($s['url'] ?? '', FILTER_VALIDATE_URL)));
    $list = '';
    foreach ($sources as $s) {
        $list .= '<li><a href="' . e($s['url']) . '">' . e(trim(($s['outlet'] ?? '') . ': ' . ($s['title'] ?? ''), ': ')) . '</a></li>';
    }
    $body = (string) $draft['body_html']
        . '<aside class="sources"><h3>Sources</h3>' . ($list ? '<ul>' . $list . '</ul>' : '')
        . '<p><em>This story was researched by Alex, written by Kristov Joi and fact-checked by David Mario — the AI agents of the ' . e(site_name()) . ' newsroom — using the reporting listed above.</em></p></aside>';
    $auto = setting('ai_autopublish', '1') === '1';
    $id = save_article([
        'title' => mb_substr((string) $draft['headline'], 0, 250),
        'slug' => unique_slug('articles', slugify((string) ($draft['slug'] ?? '')) ?: slugify((string) $draft['headline'])),
        'standfirst' => mb_substr((string) ($draft['standfirst'] ?? ''), 0, 600),
        'body' => $body,
        'image_id' => $draft['image_id'] ?? null,
        'category_id' => $cat,
        'author_id' => newsroom_agent_user('kristov'),
        'status' => $auto ? 'published' : 'pending',
        'published_at' => now(),
        'is_featured' => ($research['interest'] ?? '') === 'trending' ? 1 : 0,
        'location' => trim((string) ($draft['location'] ?? '')) ?: null,
        'lang' => setting('ai_language', 'en') === 'so' ? 'so' : 'en',
        'seo_title' => mb_substr((string) ($draft['seo_title'] ?? ''), 0, 120) ?: null,
        'seo_description' => mb_substr((string) ($draft['meta_description'] ?? ''), 0, 320) ?: null,
        'focus_keyword' => mb_substr((string) ($draft['focus_keyword'] ?? ''), 0, 120) ?: null,
        'source_name' => implode(', ', array_slice(array_unique(array_filter(array_column($sources, 'outlet'))), 0, 4)) ?: null,
        'external_id' => 'ai:' . $job['id'],
        'tags' => (array) ($draft['tags'] ?? []),
    ]);
    if ($auto) {
        after_publish($id);
        if (setting('ai_push', '0') === '1' && ($research['interest'] ?? '') === 'trending') {
            push_article(article($id));
        }
    }
    return $id;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/** Do the next piece of work. Returns a short description, or '' when there is nothing to do. */
function newsroom_step(bool $manual = false): string
{
    foreach (AGENTS as $k => $_) {
        newsroom_agent_user($k);
    }
    $job = row("SELECT * FROM ai_jobs WHERE stage = 'written' ORDER BY id LIMIT 1")
        ?: row("SELECT * FROM ai_jobs WHERE stage IN ('revise', 'researched') ORDER BY CASE stage WHEN 'revise' THEN 0 ELSE 1 END, id LIMIT 1");
    if ($job) {
        try {
            if ($job['stage'] === 'written') {
                david_review($job);
                return 'David reviewed “' . $job['topic'] . '”';
            }
            kristov_write($job);
            return 'Kristov wrote “' . $job['topic'] . '”';
        } catch (Throwable $e) {
            $failed = (int) $job['attempts'] >= 2;
            update('ai_jobs', ['attempts' => (int) $job['attempts'] + 1, 'error' => mb_substr($e->getMessage(), 0, 500), 'stage' => $failed ? 'failed' : $job['stage'], 'updated_at' => now()], 'id = ?', [$job['id']]);
            newsroom_say('system', 'Problem with “' . $job['topic'] . '”: ' . $e->getMessage() . ($failed ? ' — story dropped.' : ' — will retry.'), (int) $job['id']);
            return 'Error: ' . $e->getMessage();
        }
    }
    $assignment = row("SELECT * FROM ai_assignments WHERE status = 'open' ORDER BY id LIMIT 1");
    $queued = (int) val("SELECT COUNT(*) FROM ai_jobs WHERE stage IN ('researched', 'written', 'revise')");
    $needed = $manual ? newsroom_published_today() < newsroom_target_today() : newsroom_published_today() + $queued < newsroom_due();
    if ($assignment || (newsroom_enabled() && $needed)) {
        try {
            $n = alex_research($assignment);
            return $n ? 'Alex found ' . $n . ' stories' : ''; // nothing new: stop until the next run
        } catch (Throwable $e) {
            newsroom_say('system', 'Alex could not finish the research: ' . $e->getMessage());
            if ($assignment) {
                update('ai_assignments', ['status' => 'done', 'done_at' => now()], 'id = ?', [$assignment['id']]);
            }
            return 'Error: ' . $e->getMessage();
        }
    }
    return '';
}

/** What the newsroom is doing right now (shown live in the dashboard). */
function newsroom_status(string $text, ?int $jobId = null): void
{
    save_setting('newsroom_status', $text === '' ? '' : json_encode(['text' => $text, 'ts' => time(), 'job' => $jobId]));
}

/** Current activity, or null when idle (a status older than 20 minutes is stale: that run died). */
function newsroom_current(): ?array
{
    $s = json_decode(setting('newsroom_status'), true);
    return is_array($s) && $s['ts'] > time() - 1200 ? $s : null;
}

/**
 * Run several steps in a row (research → write → review → publish) under a lock, so cron and
 * the dashboard never work on the same story twice. If PHP is stopped mid-step (time limit),
 * the chat says so and the next run continues.
 */
function newsroom_work(bool $manual, int $maxSteps = 6, int $budget = 900): string
{
    $fh = fopen(STORAGE_PATH . '/newsroom.lock', 'c');
    if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) {
        return 'busy';
    }
    @set_time_limit(0);
    ignore_user_abort(true);
    $GLOBALS['newsroom_finished'] = false;
    register_shutdown_function(function () {
        if (!empty($GLOBALS['newsroom_finished'])) {
            return;
        }
        $err = error_get_last();
        $cur = newsroom_current();
        if ($cur && !empty($cur['job'])) {
            q("UPDATE ai_jobs SET attempts = attempts + 1, stage = CASE WHEN attempts >= 2 THEN 'failed' ELSE stage END, error = 'Interrupted by the server', updated_at = ? WHERE id = ?", [now(), (int) $cur['job']]);
        }
        newsroom_say('system', ($cur ? $cur['text'] . ' — ' : '') . 'the server stopped this step'
            . ($err && in_array($err['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR], true) ? ' (' . $err['message'] . ')' : '')
            . '. The cron job will continue it in a moment.');
        newsroom_status('');
    });
    $end = time() + $budget;
    $last = '';
    for ($i = 0; $i < $maxSteps && time() < $end - 120; $i++) {
        $did = newsroom_step($manual);
        if ($did !== '') {
            $last = $did;
        }
        if ($did === '' || strpos($did, 'Error:') === 0) {
            break; // nothing left to do, or a problem the next run can retry
        }
    }
    newsroom_status('');
    $GLOBALS['newsroom_finished'] = true;
    flock($fh, LOCK_UN);
    return $last;
}

/** Cron entry point. */
function newsroom_cron(int $budget = 420, int $maxSteps = 6): void
{
    if (!ai_enabled() || (setting('ai_newsroom_enabled', '0') !== '1' && !val("SELECT 1 FROM ai_assignments WHERE status = 'open'"))) {
        return;
    }
    newsroom_work(false, $maxSteps, $budget);
}

/** One chat message as HTML (used by the page and the live update). */
function newsroom_message_html(array $msg): string
{
    $names = ['owner' => __('You'), 'alex' => 'Alex', 'kristov' => 'Kristov Joi', 'david' => 'David Mario', 'system' => __('System')];
    return '<div class="msg msg-' . e($msg['sender']) . '" data-id="' . (int) $msg['id'] . '"><b>' . e($names[$msg['sender']] ?? $msg['sender']) . '</b> <small>' . e(fmt_date($msg['created_at'], 'M j, H:i')) . '</small>'
        . '<p>' . nl2br(preg_replace('~(https?://[^\s<]+)~', '<a href="$1" target="_blank" rel="noopener">$1</a>', e($msg['body']))) . '</p></div>';
}

/** Numbers for the dashboard. */
function newsroom_stats(): array
{
    $agentId = (int) val('SELECT id FROM users WHERE email = ?', [AGENTS['kristov']['slug'] . '@agents.invalid']);
    $views7 = 0;
    if ($agentId) {
        $ids = array_map('intval', array_column(rows("SELECT id FROM articles WHERE author_id = ? AND status = 'published'", [$agentId]), 'id'));
        foreach (array_chunk($ids, 400) as $chunk) {
            $views7 += (int) val('SELECT COUNT(*) FROM hits WHERE ts >= ? AND article_id IN (' . placeholders($chunk) . ')', array_merge([time() - 7 * 86400], $chunk));
        }
    }
    return [
        'target' => newsroom_target_today(),
        'today' => newsroom_published_today(),
        'week' => (int) val("SELECT COUNT(*) FROM ai_jobs WHERE stage = 'published' AND updated_at >= ?", [date('Y-m-d', strtotime('-6 days'))]),
        'total' => (int) val("SELECT COUNT(*) FROM ai_jobs WHERE stage = 'published'"),
        'rejected' => (int) val("SELECT COUNT(*) FROM ai_jobs WHERE stage = 'rejected' AND updated_at >= ?", [date('Y-m-d', strtotime('-6 days'))]),
        'queue' => (int) val("SELECT COUNT(*) FROM ai_jobs WHERE stage IN ('researched', 'written', 'revise')"),
        'views_total' => $agentId ? (int) val('SELECT COALESCE(SUM(views), 0) FROM articles WHERE author_id = ?', [$agentId]) : 0,
        'views_7' => $views7,
    ];
}
