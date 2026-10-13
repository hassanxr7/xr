<?php
require __DIR__ . '/app/bootstrap.php';

if (is_post()) {
    csrf_check();
    unset($_SESSION['uid']);
    session_regenerate_id(true);
    flash('success', t('logged_out'));
}
redirect('');
