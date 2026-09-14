<?php
// HomePorte release 2026-09-14. The original template below serves legacy URLs.
$hpPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$hpPreview = isset($_GET['homeporte_preview']) && $_GET['homeporte_preview'] === '20260914';
if ($hpPreview || in_array($hpPath, array('/', '/index.php', '/index.html', '/guide.html'), true)) {
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
        header('Location: https://homeporte.by' . $_SERVER['REQUEST_URI'], true, 301);
        exit;
    }
    http_response_code(200);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-cache');
    if ($hpPreview) header('X-Robots-Tag: noindex, nofollow');
    readfile(__DIR__ . '/images/homeporte-20260914-r1/' . ($hpPath === '/guide.html' ? 'guide.html' : 'index.html'));
    exit;
}
?>
