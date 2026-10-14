<?php
// Example configuration. The web installer (install/) creates app/config.php automatically.
// To configure manually: copy this file to app/config.php and fill in your details.
return [
    // Automatic database (default): a single SQLite file inside app/storage/.
    'db' => [
        'driver' => 'sqlite',
        'path'   => 'app/storage/database.sqlite',
    ],
    // MySQL instead:
    // 'db' => [
    //     'driver' => 'mysql',
    //     'host'   => 'localhost',
    //     'port'   => '',
    //     'name'   => 'u123456789_hufan',
    //     'user'   => 'u123456789_hufan',
    //     'pass'   => 'PASSWORD',
    // ],
    'base_url' => '',      // Leave empty to auto-detect (works in public_html or a sub-folder)
    'debug'    => false,   // true = show errors on screen (never leave on for a live site)
    'app_key'  => 'change-me-to-a-long-random-string',
];
