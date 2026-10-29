<?php
/**
 * The Guardia — AI writing assistant (Claude, Anthropic Messages API over cURL).
 *
 * Raw HTTP is used on purpose: the site runs on shared hosting without Composer,
 * so the official PHP SDK cannot be installed there.
 *
 * The editor gives the facts; Claude turns them into a structured, SEO-ready story.
 * It is told never to invent facts, quotes or numbers, and to flag anything to verify.
 */
defined('APP') || exit;

const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const AI_API_VERSION = '2026-10-21';

function ai_enabled(): bool
{
    return setting('ai_api_key') !== '';
}

function ai_system_prompt(): string
{
    $site = site_name();
    return <<<TXT
You are the copy desk of {$site}, an independent online news publication (Canada, U.S., Africa, world; strong coverage of courts and justice).
You turn a reporter's notes into a publishable news story and the metadata search engines need.

Accuracy rules — these override everything else:
- Use only facts present in the notes. Never invent names, numbers, dates, places, quotes, sources or outcomes.
- Keep quotes word for word. If the notes have no quotes, write none.
- Attribute claims ("police said", "according to court records"). Distinguish clearly between arrested, charged, convicted and sentenced; charged people are presumed innocent.
- In crime and court stories, never identify victims, and never identify minors.
- If something important is missing or unclear, do not fill the gap; list it in verify_notes.

Writing style:
- Inverted pyramid: the most important facts (who, what, when, where) in the first paragraph, in 35 words or fewer.
- Neutral, plain, precise news English (or Somali if asked). Short paragraphs of 1–3 sentences. Active voice. No hype, no clickbait, no opinions unless the requested type is Opinion.
- Use <h2> subheadings for stories over ~400 words. Use <ul> lists only for genuinely list-like facts. Use <blockquote> only for direct quotes from the notes.
- Body HTML may use only: p, h2, h3, ul, ol, li, strong, em, blockquote, a. No inline styles, no h1.

SEO rules:
- headline: clear and specific, 55–75 characters, main keyword near the start, no clickbait.
- seo_title: up to 60 characters. meta_description: 140–155 characters, a factual summary that makes people want to read.
- slug: lowercase words joined by hyphens, 3–8 words, no dates or stop words.
- focus_keyword: the phrase people would type into Google to find this story.
- tags: 5–10 specific topics people follow (people's full names only if public figures or convicted defendants named in official records, places, organisations, themes).
- Use the focus keyword naturally in the headline, the first paragraph and one subheading. Never keyword-stuff.
TXT;
}

/** JSON schema for structured output (all objects closed, all fields required). */
function ai_story_schema(): array
{
    $str = ['type' => 'string'];
    return [
        'type' => 'object',
        'additionalProperties' => false,
        'required' => ['headline', 'seo_title', 'meta_description', 'slug', 'standfirst', 'body_html', 'focus_keyword', 'tags', 'category_hint', 'location', 'image_alt', 'push_title', 'alt_headlines', 'verify_notes'],
        'properties' => [
            'headline'         => $str,
            'seo_title'        => $str,
            'meta_description' => $str,
            'slug'             => $str,
            'standfirst'       => ['type' => 'string', 'description' => 'One or two sentence summary shown under the headline (max 45 words).'],
            'body_html'        => $str,
            'focus_keyword'    => $str,
            'tags'             => ['type' => 'array', 'items' => $str],
            'category_hint'    => ['type' => 'string', 'description' => 'Best matching section name from the list provided.'],
            'location'         => ['type' => 'string', 'description' => 'Dateline city in capitals, or empty string.'],
            'image_alt'        => ['type' => 'string', 'description' => 'Suggested alt text for the main photo (empty if unknown).'],
            'push_title'       => ['type' => 'string', 'description' => 'Short alert text, max 70 characters.'],
            'alt_headlines'    => ['type' => 'array', 'items' => $str, 'description' => 'Three alternative headlines.'],
            'verify_notes'     => ['type' => 'array', 'items' => $str, 'description' => 'Facts the editor must check or that are missing. Empty if none.'],
        ],
    ];
}

/**
 * POST a Messages API request. Returns the decoded response (assoc array); with $raw = true also
 * returns the response decoded as objects, so content blocks can be sent back unchanged.
 * Server-side fallbacks (beta) are requested; if the account rejects them the request is retried without.
 */
function ai_http(array $body, bool $raw = false, int $timeout = 290)
{
    $key = setting('ai_api_key');
    if ($key === '') {
        throw new RuntimeException(__('Add your Anthropic API key in Settings → AI assistant first.'));
    }
    $body['fallbacks'] = 'default';
    $headers = [
        'Content-Type: application/json',
        'x-api-key: ' . $key,
        'anthropic-version: ' . AI_API_VERSION,
        'anthropic-beta: server-side-fallback-2026-07-01',
    ];
    @set_time_limit($timeout + 60);
    $json = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $endpoint = (string) config('ai_endpoint', AI_ENDPOINT); // overridable for tests
    $r = http_request('POST', $endpoint, $headers, $json, $timeout);
    if ($r['status'] === 400 && stripos($r['body'], 'fallback') !== false) {
        unset($body['fallbacks']);
        array_pop($headers);
        $r = http_request('POST', $endpoint, $headers, json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $timeout);
    }
    if ($r['error'] !== '') {
        throw new RuntimeException('Could not reach the AI service: ' . $r['error']);
    }
    $data = json_decode($r['body'], true);
    if ($r['status'] !== 200) {
        $msg = $data['error']['message'] ?? ('HTTP ' . $r['status']);
        if ($r['status'] === 401) {
            $msg = __('The Anthropic API key is not valid.');
        } elseif ($r['status'] === 429) {
            $msg = __('Too many AI requests right now. Wait a minute and try again.');
        } elseif ($r['status'] >= 500) {
            $msg = __('The AI service is busy. Please try again shortly.');
        }
        throw new RuntimeException($msg);
    }
    $usage = $data['usage'] ?? [];
    save_setting('ai_tokens_used', (string) ((int) setting('ai_tokens_used', '0') + (int) ($usage['input_tokens'] ?? 0) + (int) ($usage['output_tokens'] ?? 0)));
    return $raw ? [$data, json_decode($r['body'])] : $data;
}

/**
 * Send one request to Claude and return the decoded JSON object.
 * Throws RuntimeException with a readable message on any failure.
 */
function ai_request(string $userText, int $maxTokens = 16000): array
{
    $body = [
        'model'         => setting('ai_model', 'claude-opus-5-5'),
        'max_tokens'    => $maxTokens,
        'system'        => ai_system_prompt(),
        'messages'      => [['role' => 'user', 'content' => $userText]],
        'output_config' => [
            'effort' => in_array(setting('ai_effort', 'medium'), ['low', 'medium', 'high', 'xhigh', 'max'], true) ? setting('ai_effort', 'medium') : 'medium',
            'format' => ['type' => 'json_schema', 'schema' => ai_story_schema()],
        ],
    ];
    $data = ai_http($body);
    $stop = $data['stop_reason'] ?? '';
    if ($stop === 'refusal') {
        throw new RuntimeException(__('The AI declined to write this story. Edit the notes and try again, or write it manually.'));
    }
    if ($stop === 'max_tokens') {
        throw new RuntimeException(__('The story was too long for one request. Ask for a shorter length.'));
    }
    $text = '';
    foreach ($data['content'] ?? [] as $block) {
        if (($block['type'] ?? '') === 'text') {
            $text .= $block['text'];
        }
    }
    $json = json_decode($text, true);
    if (!is_array($json)) {
        throw new RuntimeException(__('The AI reply could not be read. Please try again.'));
    }
    return $json;
}

/**
 * Write a story from notes.
 * $opt: notes, type (news|court|analysis|opinion|explainer), length (short|medium|long), lang (en|so), headline (optional), source (optional URL/name).
 */
function ai_write_story(array $opt): array
{
    $notes = trim((string) ($opt['notes'] ?? ''));
    if (mb_strlen($notes) < 40) {
        throw new RuntimeException(__('Write at least a few sentences of facts for the AI to work with.'));
    }
    $lengths = ['short' => '250–350 words', 'medium' => '450–650 words', 'long' => '800–1,100 words'];
    $types = [
        'news'      => 'a straight news report',
        'court'     => 'a court/justice report based on official records (charges, conviction, sentence, court, judge, prosecutor office as given)',
        'analysis'  => 'a news analysis that explains context and what happens next, still based only on the notes',
        'explainer' => 'an explainer with clear subheadings answering the questions readers have',
        'opinion'   => 'an opinion column in the first person, clearly argued, using only the facts in the notes',
    ];
    $sections = implode(', ', array_map(fn ($c) => $c['name'], categories()));
    $lang = ($opt['lang'] ?? 'en') === 'so' ? 'Somali' : 'English (Canadian spelling)';
    $prompt = "Write " . ($types[$opt['type'] ?? 'news'] ?? $types['news']) . " of about " . ($lengths[$opt['length'] ?? 'medium'] ?? $lengths['medium']) . " in $lang.\n"
        . "Available sections: $sections.\n"
        . (!empty($opt['headline']) ? "The editor's working headline: " . $opt['headline'] . "\n" : '')
        . (!empty($opt['source']) ? "Source of the information: " . $opt['source'] . " (attribute it in the story).\n" : '')
        . "Today's date: " . date('l, F j, Y') . ".\n\n"
        . "<notes>\n" . $notes . "\n</notes>";
    $out = ai_request($prompt);
    $out['body_html'] = sanitize_html((string) ($out['body_html'] ?? ''));
    $out['slug'] = slugify((string) ($out['slug'] ?? ''));
    $out['tags'] = array_values(array_slice(array_filter(array_map('trim', (array) ($out['tags'] ?? []))), 0, 10));
    return $out;
}

/** Improve SEO fields (and suggest headlines/tags) for an existing draft without rewriting the body. */
function ai_seo_for(string $title, string $body): array
{
    $text = str_limit(plain_text($body), 12000);
    if (mb_strlen($text) < 100) {
        throw new RuntimeException(__('Write the story first, then ask for SEO suggestions.'));
    }
    $prompt = "This story is already written. Do NOT change its facts. Return the metadata fields for it, plus alternative headlines and tags. "
        . "Return body_html as an empty string.\n\n"
        . "Available sections: " . implode(', ', array_map(fn ($c) => $c['name'], categories())) . ".\n\n"
        . "<headline>" . $title . "</headline>\n<story>\n" . $text . "\n</story>";
    $out = ai_request($prompt);
    $out['slug'] = slugify((string) ($out['slug'] ?? ''));
    unset($out['body_html']);
    return $out;
}
