<?php
/**
 * The Guardia — server-rendered SVG charts for the dashboard (no JavaScript library).
 * Views are bars, visitors a 2px line on the same count axis; hover shows exact values.
 */
defined('APP') || exit;

/** Round an axis maximum up to 1/2/2.5/5 × 10^n. */
function nice_max(float $v): float
{
    if ($v <= 0) {
        return 10;
    }
    $exp = floor(log10($v));
    $f = $v / 10 ** $exp;
    foreach ([1, 2, 2.5, 5, 10] as $n) {
        if ($f <= $n) {
            return $n * 10 ** $exp;
        }
    }
    return 10 * 10 ** $exp;
}

function short_num(float $n): string
{
    if ($n >= 1e6) {
        return rtrim(rtrim(number_format($n / 1e6, 1), '0'), '.') . 'M';
    }
    if ($n >= 1e4) {
        return rtrim(rtrim(number_format($n / 1e3, 1), '0'), '.') . 'k';
    }
    return number_format($n);
}

/**
 * @param array $series label => ['views' => int, 'visitors' => int]
 * @param callable|null $fmtLabel formats x labels
 */
function views_chart(array $series, ?callable $fmtLabel = null, string $title = ''): string
{
    $n = count($series);
    if ($n === 0) {
        return '<p class="hint">' . e(__('No data yet.')) . '</p>';
    }
    $W = 760;
    $H = 240;
    $padL = 44;
    $padR = 10;
    $padT = 12;
    $padB = 28;
    $plotW = $W - $padL - $padR;
    $plotH = $H - $padT - $padB;
    $max = nice_max(max(1, max(array_map(fn ($r) => max($r['views'], $r['visitors']), $series))));
    $band = $plotW / $n;
    $barW = min(24, max(2, $band * 0.62));
    $y = fn ($v) => $padT + $plotH - ($v / $max) * $plotH;
    $svg = '<svg class="chart" viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="' . e($title ?: __('Views over time')) . '">';
    // Grid + y axis labels
    for ($i = 0; $i <= 4; $i++) {
        $v = $max * $i / 4;
        $yy = round($y($v), 1);
        $svg .= '<line class="grid" x1="' . $padL . '" x2="' . ($W - $padR) . '" y1="' . $yy . '" y2="' . $yy . '"/>';
        $svg .= '<text class="axis" x="' . ($padL - 6) . '" y="' . ($yy + 4) . '" text-anchor="end">' . e(short_num($v)) . '</text>';
    }
    $labels = array_keys($series);
    $every = max(1, (int) ceil($n / 12));
    $points = [];
    foreach ($labels as $i => $label) {
        $r = $series[$label];
        $cx = $padL + $band * $i + $band / 2;
        $top = $y($r['views']);
        $h = $padT + $plotH - $top;
        if ($r['views'] > 0) {
            $rad = min(4, $barW / 2, $h);
            $x0 = $cx - $barW / 2;
            $x1 = $cx + $barW / 2;
            $base = $padT + $plotH;
            $svg .= '<path class="bar" d="M' . round($x0, 1) . ' ' . $base . 'V' . round($top + $rad, 1) . 'Q' . round($x0, 1) . ' ' . round($top, 1) . ' ' . round($x0 + $rad, 1) . ' ' . round($top, 1)
                . 'H' . round($x1 - $rad, 1) . 'Q' . round($x1, 1) . ' ' . round($top, 1) . ' ' . round($x1, 1) . ' ' . round($top + $rad, 1) . 'V' . $base . 'Z"/>';
        }
        $points[] = round($cx, 1) . ',' . round($y($r['visitors']), 1);
        $text = $fmtLabel ? $fmtLabel((string) $label) : (string) $label;
        if ($i % $every === 0) {
            $svg .= '<text class="axis" x="' . round($cx, 1) . '" y="' . ($H - 8) . '" text-anchor="middle">' . e($text) . '</text>';
        }
        $tip = $text . ' — ' . fmt_num($r['views']) . ' ' . __('views') . ', ' . fmt_num($r['visitors']) . ' ' . __('visitors');
        $svg .= '<rect class="hit" x="' . round($padL + $band * $i, 1) . '" y="' . $padT . '" width="' . round($band, 1) . '" height="' . $plotH . '" data-tip="' . e($tip) . '"><title>' . e($tip) . '</title></rect>';
    }
    if ($n > 1) {
        $svg .= '<polyline class="line" points="' . implode(' ', $points) . '"/>';
    }
    $svg .= '<line class="baseline" x1="' . $padL . '" x2="' . ($W - $padR) . '" y1="' . ($padT + $plotH) . '" y2="' . ($padT + $plotH) . '"/>';
    $svg .= '</svg>';
    $legend = '<div class="legend"><span><i class="sw-bar"></i>' . e(__('Page views')) . '</span><span><i class="sw-line"></i>' . e(__('Visitors')) . '</span></div>';
    return '<div class="chart-wrap">' . $legend . $svg . '</div>';
}

/** Ranked table with a thin inline magnitude bar. $rows: [label, views, visitors, extra-html]. */
function rank_table(array $rows, string $col = '', bool $showVisitors = true): string
{
    if (!$rows) {
        return '<p class="hint">' . e(__('No data yet.')) . '</p>';
    }
    $max = max(1, max(array_column($rows, 1)));
    $total = max(1, array_sum(array_column($rows, 1)));
    $out = '<table class="rank"><thead><tr><th>' . e($col) . '</th><th class="num">' . e(__('Views')) . '</th>'
        . ($showVisitors ? '<th class="num">' . e(__('Visitors')) . '</th>' : '') . '<th class="num">%</th></tr></thead><tbody>';
    foreach ($rows as [$label, $views, $visitors]) {
        $out .= '<tr><td><div class="rank-label">' . $label . '</div><div class="rank-bar"><i style="width:' . round($views / $max * 100, 1) . '%"></i></div></td>'
            . '<td class="num">' . fmt_num($views) . '</td>' . ($showVisitors ? '<td class="num">' . fmt_num($visitors) . '</td>' : '')
            . '<td class="num">' . round($views / $total * 100, 1) . '</td></tr>';
    }
    return $out . '</tbody></table>';
}

function stat_tile(string $label, string $value, string $sub = ''): string
{
    return '<div class="tile"><div class="tile-label">' . e($label) . '</div><div class="tile-value">' . e($value) . '</div>' . ($sub ? '<div class="tile-sub">' . $sub . '</div>' : '') . '</div>';
}
