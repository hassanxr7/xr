<?php
require dirname(__DIR__) . '/app/bootstrap.php';

if (is_post()) {
    csrf_check();
    unset($_SESSION['admin_id']);
    session_regenerate_id(true);
}
redirect('admin/login.php');
