<?php
/** Shared <head> + letterhead helpers for printable documents (statement, receipt, report). */
defined('APP') || exit;
?><!doctype html>
<html lang="<?= e(lang()) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($docTitle ?? setting('site_name')) ?></title>
<link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/print.css')) ?>">
<style>:root{--brand:<?= e(brand_color()) ?>}</style>
</head>
<body class="doc-body"<?= !empty($autoPrint) ? ' data-autoprint' : '' ?>>
