<?php
/** Original inline SVG illustrations (no external images = fast + no copyright issues). */

function art_dashboard(): string
{
    ob_start(); ?>
<svg class="art art-dashboard" viewBox="0 0 640 420" role="img" aria-label="ITrackZen live fleet tracking dashboard showing vehicles on a map, route history, fuel level and alerts">
  <defs>
    <linearGradient id="dg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12315f"/><stop offset="1" stop-color="#0a1f44"/></linearGradient>
    <linearGradient id="dg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1e6bff"/><stop offset="1" stop-color="#12b76a"/></linearGradient>
    <pattern id="dgrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1b4175" stroke-width=".6" opacity=".7"/></pattern>
  </defs>
  <rect x="2" y="2" width="636" height="416" rx="18" fill="#0b2148" stroke="#27487f" stroke-width="2"/>
  <rect x="2" y="2" width="636" height="34" rx="18" fill="#0f2b5b"/><rect x="2" y="20" width="636" height="16" fill="#0f2b5b"/>
  <circle cx="22" cy="19" r="4.5" fill="#ff6b6b"/><circle cx="38" cy="19" r="4.5" fill="#ffc94d"/><circle cx="54" cy="19" r="4.5" fill="#3ddc97"/>
  <rect x="86" y="10" width="220" height="18" rx="9" fill="#173a70"/><text x="100" y="23" font-size="10" fill="#9db7e3">app.itrackzen.net / live-map</text>
  <!-- sidebar -->
  <rect x="14" y="48" width="46" height="358" rx="10" fill="#0f2b5b"/>
  <g stroke="#6f93cf" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M30 72h14M30 86h14M30 100h14"/><circle cx="37" cy="134" r="8"/><path d="M29 170h16M29 178h10"/><rect x="29" y="206" width="16" height="12" rx="2"/><path d="M29 250l5 5 9-10"/></g>
  <rect x="22" y="62" width="30" height="46" rx="8" fill="none" stroke="#1e6bff" stroke-width="1.5" opacity=".0"/>
  <!-- KPI row -->
  <g font-family="inherit">
    <rect x="72" y="48" width="118" height="54" rx="10" fill="#0f2b5b"/><text x="84" y="68" font-size="9" fill="#8fb0e6">ACTIVE VEHICLES</text><text x="84" y="90" font-size="20" font-weight="700" fill="#fff">128</text><rect x="140" y="80" width="40" height="8" rx="4" fill="#12b76a" opacity=".85"/>
    <rect x="198" y="48" width="118" height="54" rx="10" fill="#0f2b5b"/><text x="210" y="68" font-size="9" fill="#8fb0e6">DISTANCE TODAY</text><text x="210" y="90" font-size="20" font-weight="700" fill="#fff">9,430<tspan font-size="10" fill="#8fb0e6"> km</tspan></text>
    <rect x="324" y="48" width="118" height="54" rx="10" fill="#0f2b5b"/><text x="336" y="68" font-size="9" fill="#8fb0e6">FUEL EFFICIENCY</text><text x="336" y="90" font-size="20" font-weight="700" fill="#fff">+8.4<tspan font-size="10" fill="#3ddc97"> %</tspan></text>
    <rect x="450" y="48" width="176" height="54" rx="10" fill="#0f2b5b"/><text x="462" y="68" font-size="9" fill="#8fb0e6">ALERTS (24H)</text><text x="462" y="90" font-size="20" font-weight="700" fill="#fff">17</text>
    <g transform="translate(520 60)"><rect width="92" height="30" rx="6" fill="#0a1f44"/><path d="M6 22l12-8 10 5 14-12 12 8 14-6 16 6" fill="none" stroke="url(#dg2)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>
  </g>
  <!-- map -->
  <clipPath id="mapclip"><rect x="72" y="112" width="370" height="294" rx="12"/></clipPath>
  <rect x="72" y="112" width="370" height="294" rx="12" fill="url(#dg1)"/>
  <g clip-path="url(#mapclip)">
    <rect x="72" y="112" width="370" height="294" fill="url(#dgrid)"/>
    <g fill="none" stroke="#20508f" stroke-linecap="round"><path d="M72 330 C150 300 190 340 250 290 S380 250 442 200" stroke-width="9" opacity=".55"/><path d="M130 406 C150 330 170 250 150 112" stroke-width="7" opacity=".5"/><path d="M72 200 C170 210 260 170 442 250" stroke-width="6" opacity=".45"/><path d="M300 406 C310 330 330 250 380 112" stroke-width="6" opacity=".4"/></g>
    <path d="M110 372 C150 340 160 300 210 288 S320 270 372 214 S404 170 420 150" fill="none" stroke="#1e6bff" stroke-width="4" stroke-linecap="round" stroke-dasharray="9 8"><animate attributeName="stroke-dashoffset" from="34" to="0" dur="1.8s" repeatCount="indefinite"/></path>
    <path d="M110 372 C150 340 160 300 210 288 S320 270 372 214 S404 170 420 150" fill="none" stroke="#12b76a" stroke-width="4" stroke-linecap="round" opacity=".0"/>
    <g><circle r="14" fill="#12b76a" opacity=".25"><animate attributeName="r" values="10;22;10" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".4;0;.4" dur="2s" repeatCount="indefinite"/></circle><circle r="7" fill="#12b76a" stroke="#fff" stroke-width="2.4"/>
      <animateMotion dur="9s" repeatCount="indefinite" path="M110 372 C150 340 160 300 210 288 S320 270 372 214 S404 170 420 150"/></g>
    <g transform="translate(250 330)"><circle r="14" fill="#ffc94d" opacity=".25"/><circle r="7" fill="#ffc94d" stroke="#fff" stroke-width="2.4"/></g>
    <g transform="translate(176 170)"><circle r="14" fill="#1e6bff" opacity=".25"/><circle r="7" fill="#1e6bff" stroke="#fff" stroke-width="2.4"/></g>
    <g transform="translate(360 330)"><circle r="14" fill="#ff6b6b" opacity=".22"><animate attributeName="opacity" values=".1;.4;.1" dur="1.4s" repeatCount="indefinite"/></circle><circle r="7" fill="#ff6b6b" stroke="#fff" stroke-width="2.4"/></g>
    <g transform="translate(300 156)" fill="none" stroke="#12b76a" stroke-width="2" stroke-dasharray="5 4"><circle r="38"/></g>
  </g>
  <rect x="96" y="124" width="132" height="24" rx="12" fill="#0a1f44" opacity=".9"/><circle cx="110" cy="136" r="4" fill="#12b76a"/><text x="120" y="140" font-size="10" fill="#dce8ff">TRK-204 · 62 km/h</text>
  <!-- right panel -->
  <rect x="450" y="112" width="176" height="294" rx="12" fill="#0f2b5b"/>
  <text x="464" y="134" font-size="10" fill="#8fb0e6">FLEET STATUS</text>
  <g font-size="10"><g transform="translate(464 148)"><circle cx="5" cy="9" r="4.5" fill="#12b76a"/><text x="16" y="12" fill="#fff">TRK-204</text><text x="108" y="12" fill="#8fb0e6">Moving</text></g>
  <g transform="translate(464 172)"><circle cx="5" cy="9" r="4.5" fill="#ffc94d"/><text x="16" y="12" fill="#fff">VAN-031</text><text x="108" y="12" fill="#8fb0e6">Idle 12m</text></g>
  <g transform="translate(464 196)"><circle cx="5" cy="9" r="4.5" fill="#1e6bff"/><text x="16" y="12" fill="#fff">BUS-117</text><text x="108" y="12" fill="#8fb0e6">Parked</text></g>
  <g transform="translate(464 220)"><circle cx="5" cy="9" r="4.5" fill="#ff6b6b"/><text x="16" y="12" fill="#fff">CAR-088</text><text x="108" y="12" fill="#ff9d9d">Overspeed</text></g></g>
  <line x1="464" y1="256" x2="612" y2="256" stroke="#1d4177"/>
  <text x="464" y="276" font-size="10" fill="#8fb0e6">FUEL · TRK-204</text>
  <rect x="464" y="284" width="148" height="10" rx="5" fill="#0a1f44"/><rect x="464" y="284" width="104" height="10" rx="5" fill="url(#dg2)"/>
  <text x="464" y="312" font-size="10" fill="#fff">70% · 312 L</text>
  <g transform="translate(464 326)"><rect width="148" height="64" rx="8" fill="#0a1f44"/>
    <g fill="#1e6bff"><rect x="12" y="34" width="12" height="20" rx="3"/><rect x="34" y="22" width="12" height="32" rx="3"/><rect x="56" y="30" width="12" height="24" rx="3"/><rect x="78" y="14" width="12" height="40" rx="3" fill="#12b76a"/><rect x="100" y="26" width="12" height="28" rx="3"/><rect x="122" y="18" width="12" height="36" rx="3"/></g></g>
</svg>
<?php return (string)ob_get_clean();
}

function art_truck(): string
{
    ob_start(); ?>
<svg class="art art-truck" viewBox="0 0 520 260" role="img" aria-label="Cargo truck fitted with an ITrackZen GPS tracker and AI dashcam">
  <defs><linearGradient id="tr1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e6bff"/><stop offset="1" stop-color="#0f47b8"/></linearGradient></defs>
  <ellipse cx="260" cy="228" rx="230" ry="14" fill="#0a1f44" opacity=".18"/>
  <rect x="20" y="52" width="290" height="130" rx="10" fill="#f4f8ff" stroke="#c9d8f2" stroke-width="2"/>
  <rect x="20" y="52" width="290" height="28" rx="10" fill="url(#tr1)"/>
  <text x="40" y="106" font-size="30" font-weight="800" fill="#0a1f44" font-family="inherit">ITrack<tspan fill="#12b76a">Zen</tspan></text>
  <text x="41" y="130" font-size="12" letter-spacing="2" fill="#4b6591">LIBDEX LOGISTICS SOLUTION</text>
  <path d="M40 160h250" stroke="#12b76a" stroke-width="5" stroke-linecap="round"/>
  <path d="M318 182V84h92l56 56v42z" fill="url(#tr1)"/>
  <path d="M338 100h62l36 36h-98z" fill="#cfe2ff"/><path d="M338 100h62l36 36h-98z" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>
  <rect x="318" y="176" width="150" height="14" rx="4" fill="#0a1f44"/>
  <rect x="446" y="150" width="20" height="10" rx="3" fill="#ffd966"/>
  <circle cx="86" cy="196" r="28" fill="#0a1f44"/><circle cx="86" cy="196" r="12" fill="#c9d8f2"/>
  <circle cx="160" cy="196" r="28" fill="#0a1f44"/><circle cx="160" cy="196" r="12" fill="#c9d8f2"/>
  <circle cx="404" cy="196" r="28" fill="#0a1f44"/><circle cx="404" cy="196" r="12" fill="#c9d8f2"/>
  <!-- dashcam on windshield -->
  <g transform="translate(372 94)"><rect width="22" height="12" rx="4" fill="#0a1f44"/><circle cx="11" cy="6" r="3" fill="#12b76a"><animate attributeName="opacity" values="1;.2;1" dur="1.4s" repeatCount="indefinite"/></circle></g>
  <!-- GPS signal -->
  <g fill="none" stroke="#12b76a" stroke-width="3" stroke-linecap="round" opacity=".9"><path d="M372 66a24 24 0 0 1 32 0"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></path><path d="M360 50a42 42 0 0 1 56 0"><animate attributeName="opacity" values="0;1;0" dur="2s" begin=".35s" repeatCount="indefinite"/></path></g>
  <circle cx="388" cy="76" r="5" fill="#12b76a"/>
</svg>
<?php return (string)ob_get_clean();
}

function art_tracker(string $variant = 'obd'): string
{
    ob_start();
    if ($variant === 'obd') { ?>
<svg class="art art-device" viewBox="0 0 160 120" role="img" aria-label="OBD plug-in GPS tracker"><rect x="30" y="28" width="100" height="56" rx="14" fill="#0a1f44"/><rect x="42" y="40" width="40" height="8" rx="4" fill="#1e6bff"/><circle cx="104" cy="44" r="4" fill="#12b76a"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="116" cy="44" r="4" fill="#ffc94d"/><path d="M44 62h72" stroke="#27487f" stroke-width="2"/><rect x="48" y="84" width="64" height="18" rx="3" fill="#27487f"/><path d="M56 90h4M66 90h4M76 90h4M86 90h4M96 90h4" stroke="#9db7e3" stroke-width="3" stroke-linecap="round"/></svg>
<?php } elseif ($variant === 'wired') { ?>
<svg class="art art-device" viewBox="0 0 160 120" role="img" aria-label="Hardwired vehicle GPS tracker"><rect x="40" y="36" width="80" height="48" rx="10" fill="#0a1f44"/><text x="80" y="66" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">iTZ</text><circle cx="52" cy="46" r="3.5" fill="#12b76a"/><circle cx="64" cy="46" r="3.5" fill="#1e6bff"/><path d="M40 60H14M40 70H14M120 60h26M120 70h26" stroke="#ff6b6b" stroke-width="3" stroke-linecap="round"/><path d="M14 60v-8M14 70v8M146 60v-8" stroke="#27487f" stroke-width="3" stroke-linecap="round"/></svg>
<?php } elseif ($variant === 'asset') { ?>
<svg class="art art-device" viewBox="0 0 160 120" role="img" aria-label="Battery powered asset GPS tracker"><rect x="42" y="22" width="76" height="76" rx="16" fill="#0a1f44"/><rect x="54" y="34" width="52" height="30" rx="8" fill="#14386f"/><path d="M62 54l10-10 8 6 12-10" fill="none" stroke="#12b76a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="58" y="74" width="44" height="10" rx="5" fill="#27487f"/><rect x="58" y="74" width="30" height="10" rx="5" fill="#12b76a"/></svg>
<?php } elseif ($variant === 'moto') { ?>
<svg class="art art-device" viewBox="0 0 160 120" role="img" aria-label="Compact motorcycle GPS tracker"><rect x="52" y="34" width="56" height="52" rx="12" fill="#0a1f44"/><circle cx="80" cy="52" r="7" fill="#1e6bff"/><path d="M62 72h36" stroke="#27487f" stroke-width="3" stroke-linecap="round"/><circle cx="96" cy="46" r="3" fill="#12b76a"/><path d="M52 60H28M108 60h24" stroke="#ff6b6b" stroke-width="3" stroke-linecap="round"/></svg>
<?php } elseif ($variant === 'cam') { ?>
<svg class="art art-device" viewBox="0 0 160 120" role="img" aria-label="AI dashcam with front and cabin lens"><rect x="30" y="34" width="100" height="44" rx="12" fill="#0a1f44"/><circle cx="62" cy="56" r="14" fill="#14386f" stroke="#1e6bff" stroke-width="3"/><circle cx="62" cy="56" r="5" fill="#9db7e3"/><circle cx="104" cy="56" r="10" fill="#14386f" stroke="#12b76a" stroke-width="3"/><circle cx="104" cy="56" r="3.5" fill="#9db7e3"/><rect x="72" y="78" width="16" height="14" rx="3" fill="#27487f"/><circle cx="118" cy="42" r="2.5" fill="#ff6b6b"><animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/></circle></svg>
<?php } else { ?>
<svg class="art art-device" viewBox="0 0 160 120" role="img" aria-label="4G GPS tracker"><rect x="40" y="26" width="80" height="70" rx="14" fill="#0a1f44"/><text x="80" y="58" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">4G</text><g fill="none" stroke="#12b76a" stroke-width="3" stroke-linecap="round"><path d="M64 74a22 22 0 0 1 32 0"/><path d="M72 82a11 11 0 0 1 16 0"/></g><path d="M120 40V14" stroke="#27487f" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="12" r="4" fill="#1e6bff"/></svg>
<?php }
    return (string)ob_get_clean();
}

/** Scenes for the "video-style" product tour. */
function art_scene(string $scene): string
{
    ob_start();
    switch ($scene) {
    case 'camera': ?>
<svg class="scene" viewBox="0 0 640 360" role="img" aria-label="AI dashcam road view with vehicle and driver detection"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d6fb8"/><stop offset="1" stop-color="#cfe2ff"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#sk)"/><path d="M0 200h640v160H0z" fill="#27324a"/><path d="M250 200 90 360h460L390 200z" fill="#1b2438"/><path d="M320 200v160" stroke="#fff" stroke-width="4" stroke-dasharray="22 18"><animate attributeName="stroke-dashoffset" from="0" to="-80" dur="1.1s" repeatCount="indefinite"/></path>
<path d="M0 200 120 150l80 50 90-60 80 60 100-70 90 60 80-40v100z" fill="#7da2d6" opacity=".55"/>
<g transform="translate(290 218)"><rect width="62" height="38" rx="6" fill="#f4f8ff"/><rect x="6" y="6" width="50" height="14" rx="3" fill="#7da2d6"/><circle cx="10" cy="32" r="4" fill="#ff6b6b"/><circle cx="52" cy="32" r="4" fill="#ff6b6b"/></g>
<rect x="276" y="206" width="90" height="62" rx="4" fill="none" stroke="#12b76a" stroke-width="3"/><rect x="276" y="188" width="86" height="18" fill="#12b76a"/><text x="282" y="201" font-size="11" font-weight="700" fill="#fff">VEHICLE · 18 m</text>
<g transform="translate(18 18)"><rect width="150" height="22" rx="11" fill="#0a1f44" opacity=".85"/><circle cx="14" cy="11" r="5" fill="#ff4d4d"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></circle><text x="26" y="15" font-size="11" fill="#fff">REC · FRONT CAM</text></g>
<g transform="translate(442 18)"><rect width="180" height="150" rx="10" fill="#0a1f44" opacity=".92"/><text x="12" y="20" font-size="10" fill="#8fb0e6">IN-CABIN</text><circle cx="90" cy="64" r="24" fill="#27487f"/><path d="M44 130c4-24 22-34 46-34s42 10 46 34z" fill="#27487f"/><rect x="62" y="40" width="56" height="48" rx="8" fill="none" stroke="#ffc94d" stroke-width="2.5"/><rect x="12" y="104" width="156" height="30" rx="8" fill="#ffc94d"/><text x="22" y="124" font-size="12" font-weight="700" fill="#0a1f44">Phone use detected</text></g></svg>
<?php break; case 'map': ?>
<svg class="scene" viewBox="0 0 640 360" role="img" aria-label="Live fleet map with moving vehicles and geofence"><defs><pattern id="sg" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#1b4175" stroke-width=".6"/></pattern></defs><rect width="640" height="360" fill="#0c244d"/><rect width="640" height="360" fill="url(#sg)"/>
<g fill="none" stroke="#21508f" stroke-linecap="round"><path d="M0 280C120 250 200 300 300 240S500 170 640 150" stroke-width="12" opacity=".6"/><path d="M120 360C150 260 160 160 140 0" stroke-width="9" opacity=".55"/><path d="M0 120C140 130 300 90 640 220" stroke-width="8" opacity=".5"/><path d="M420 360C440 260 470 120 520 0" stroke-width="8" opacity=".45"/></g>
<circle cx="330" cy="150" r="70" fill="#12b76a" opacity=".12" stroke="#12b76a" stroke-width="2" stroke-dasharray="7 6"/>
<g><circle r="9" fill="#12b76a" stroke="#fff" stroke-width="3"/><animateMotion dur="8s" repeatCount="indefinite" path="M0 280C120 250 200 300 300 240S500 170 640 150"/></g>
<g><circle r="9" fill="#1e6bff" stroke="#fff" stroke-width="3"/><animateMotion dur="11s" repeatCount="indefinite" path="M0 120C140 130 300 90 640 220"/></g>
<g><circle r="9" fill="#ffc94d" stroke="#fff" stroke-width="3"/><animateMotion dur="9s" repeatCount="indefinite" path="M420 360C440 260 470 120 520 0"/></g>
<g transform="translate(24 24)"><rect width="200" height="64" rx="12" fill="#0a1f44" opacity=".92"/><text x="14" y="24" font-size="11" fill="#8fb0e6">LIVE · 3 vehicles moving</text><text x="14" y="48" font-size="16" font-weight="700" fill="#fff">Nairobi → Mombasa</text></g>
<g transform="translate(420 276)"><rect width="196" height="56" rx="12" fill="#0a1f44" opacity=".92"/><circle cx="22" cy="28" r="6" fill="#12b76a"/><text x="38" y="26" font-size="12" font-weight="700" fill="#fff">Geofence: Depot A</text><text x="38" y="42" font-size="10" fill="#8fb0e6">Vehicle entered 2 min ago</text></g></svg>
<?php break; case 'route': ?>
<svg class="scene" viewBox="0 0 640 360" role="img" aria-label="Route history playback with stops and speed graph"><defs><pattern id="sg2" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#1b4175" stroke-width=".6"/></pattern></defs><rect width="640" height="360" fill="#0c244d"/><rect width="640" height="360" fill="url(#sg2)"/>
<g fill="none" stroke="#21508f" stroke-linecap="round"><path d="M0 240C140 200 250 260 370 180S560 110 640 90" stroke-width="10" opacity=".5"/><path d="M200 360C210 260 190 120 230 0" stroke-width="8" opacity=".45"/></g>
<path d="M60 290C130 230 170 270 250 210S380 150 450 130 560 80 590 60" fill="none" stroke="#1e6bff" stroke-width="5" stroke-linecap="round"/>
<path d="M60 290C130 230 170 270 250 210S380 150 450 130 560 80 590 60" fill="none" stroke="#12b76a" stroke-width="5" stroke-linecap="round" stroke-dasharray="520 900"><animate attributeName="stroke-dasharray" values="0 900;520 900" dur="5s" repeatCount="indefinite"/></path>
<g stroke="#fff" stroke-width="3"><circle cx="60" cy="290" r="9" fill="#12b76a"/><circle cx="250" cy="210" r="9" fill="#ffc94d"/><circle cx="450" cy="130" r="9" fill="#ffc94d"/><circle cx="590" cy="60" r="9" fill="#ff6b6b"/></g>
<g font-size="11" fill="#fff"><text x="76" y="318">Start 06:10</text><text x="236" y="236">Stop 18 min</text><text x="436" y="158">Stop 9 min</text><text x="540" y="46">End 14:42</text></g>
<g transform="translate(24 24)"><rect width="150" height="58" rx="12" fill="#0a1f44" opacity=".92"/><text x="14" y="24" font-size="11" fill="#8fb0e6">TRIP DISTANCE</text><text x="14" y="46" font-size="18" font-weight="700" fill="#fff">386 km</text></g>
<g transform="translate(24 280)"><rect width="592" height="60" rx="12" fill="#0a1f44" opacity=".92"/><path d="M16 44l40-14 40 8 40-22 40 24 40-10 40 4 40-18 40 12 40-10 40 6 40-14 40 10 40-6" fill="none" stroke="#12b76a" stroke-width="2.5" stroke-linejoin="round"/></g></svg>
<?php break; case 'alerts': ?>
<svg class="scene" viewBox="0 0 640 360" role="img" aria-label="Real-time alerts list: overspeed, geofence, ignition, SOS"><rect width="640" height="360" fill="#0c244d"/>
<g font-size="13">
<g transform="translate(40 30)"><rect width="560" height="58" rx="12" fill="#12315f"/><circle cx="32" cy="29" r="14" fill="#ff6b6b" opacity=".25"/><circle cx="32" cy="29" r="6" fill="#ff6b6b"/><text x="60" y="26" font-weight="700" fill="#fff">Overspeed · TRK-204</text><text x="60" y="44" font-size="11" fill="#8fb0e6">96 km/h in an 80 km/h zone · 2 min ago</text><rect x="470" y="17" width="72" height="24" rx="12" fill="#ff6b6b"/><text x="506" y="33" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">HIGH</text></g>
<g transform="translate(40 100)"><rect width="560" height="58" rx="12" fill="#12315f"/><circle cx="32" cy="29" r="14" fill="#12b76a" opacity=".25"/><circle cx="32" cy="29" r="6" fill="#12b76a"/><text x="60" y="26" font-weight="700" fill="#fff">Geofence exit · VAN-031</text><text x="60" y="44" font-size="11" fill="#8fb0e6">Left Mombasa Depot · 9 min ago</text><rect x="470" y="17" width="72" height="24" rx="12" fill="#1e6bff"/><text x="506" y="33" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">INFO</text></g>
<g transform="translate(40 170)"><rect width="560" height="58" rx="12" fill="#12315f"/><circle cx="32" cy="29" r="14" fill="#ffc94d" opacity=".25"/><circle cx="32" cy="29" r="6" fill="#ffc94d"/><text x="60" y="26" font-weight="700" fill="#fff">Ignition on after hours · BUS-117</text><text x="60" y="44" font-size="11" fill="#8fb0e6">Engine started at 23:48 · 31 min ago</text><rect x="470" y="17" width="72" height="24" rx="12" fill="#ffc94d"/><text x="506" y="33" text-anchor="middle" font-size="11" font-weight="700" fill="#0a1f44">WARN</text></g>
<g transform="translate(40 240)"><rect width="560" height="58" rx="12" fill="#12315f"/><circle cx="32" cy="29" r="14" fill="#ff6b6b" opacity=".25"/><circle cx="32" cy="29" r="6" fill="#ff6b6b"><animate attributeName="opacity" values="1;.3;1" dur="1.1s" repeatCount="indefinite"/></circle><text x="60" y="26" font-weight="700" fill="#fff">Fuel drop detected · TRK-092</text><text x="60" y="44" font-size="11" fill="#8fb0e6">-48 L while parked · 1 h ago</text><rect x="470" y="17" width="72" height="24" rx="12" fill="#ff6b6b"/><text x="506" y="33" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">HIGH</text></g>
</g></svg>
<?php break; default: ?>
<svg class="scene" viewBox="0 0 640 360" role="img" aria-label="Fleet analytics dashboard with charts"><rect width="640" height="360" fill="#0c244d"/>
<g transform="translate(30 28)"><rect width="180" height="86" rx="12" fill="#12315f"/><text x="14" y="26" font-size="11" fill="#8fb0e6">DISTANCE (7 DAYS)</text><text x="14" y="62" font-size="26" font-weight="700" fill="#fff">62,310 km</text></g>
<g transform="translate(230 28)"><rect width="180" height="86" rx="12" fill="#12315f"/><text x="14" y="26" font-size="11" fill="#8fb0e6">FUEL USED</text><text x="14" y="62" font-size="26" font-weight="700" fill="#fff">18,420 L</text></g>
<g transform="translate(430 28)"><rect width="180" height="86" rx="12" fill="#12315f"/><text x="14" y="26" font-size="11" fill="#8fb0e6">SAFETY SCORE</text><text x="14" y="62" font-size="26" font-weight="700" fill="#3ddc97">91 / 100</text></g>
<g transform="translate(30 130)"><rect width="370" height="200" rx="12" fill="#12315f"/><text x="16" y="28" font-size="11" fill="#8fb0e6">DAILY DISTANCE</text>
<g fill="#1e6bff"><rect x="26" y="110" width="30" height="70" rx="5"/><rect x="72" y="80" width="30" height="100" rx="5"/><rect x="118" y="96" width="30" height="84" rx="5"/><rect x="164" y="60" width="30" height="120" rx="5" fill="#12b76a"/><rect x="210" y="88" width="30" height="92" rx="5"/><rect x="256" y="104" width="30" height="76" rx="5"/><rect x="302" y="70" width="30" height="110" rx="5"/></g></g>
<g transform="translate(420 130)"><rect width="190" height="200" rx="12" fill="#12315f"/><text x="16" y="28" font-size="11" fill="#8fb0e6">DRIVER EVENTS</text>
<circle cx="95" cy="112" r="48" fill="none" stroke="#1e6bff" stroke-width="18" stroke-dasharray="120 300" transform="rotate(-90 95 112)"/><circle cx="95" cy="112" r="48" fill="none" stroke="#12b76a" stroke-width="18" stroke-dasharray="90 300" stroke-dashoffset="-120" transform="rotate(-90 95 112)"/><circle cx="95" cy="112" r="48" fill="none" stroke="#ffc94d" stroke-width="18" stroke-dasharray="60 300" stroke-dashoffset="-210" transform="rotate(-90 95 112)"/>
<text x="95" y="118" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">214</text></g></svg>
<?php }
    return (string)ob_get_clean();
}
