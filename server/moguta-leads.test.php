<?php
// Run with PHP CLI; the injected sender never sends a real message.
if (!function_exists('homeporteAcceptLead')) require __DIR__ . '/moguta-leads.php';
$calls = 0;
$recipient = 'test@example.com';
$sender = function ($to, $subject, $body, $headers) use (&$calls, $recipient) {
    if ($to !== $recipient || strpos($body, 'Контакт: @testing') === false) throw new Exception('Wrong message destination/body');
    $calls++;
    return true;
};
$storage = sys_get_temp_dir() . '/homeporte-test-' . uniqid();
$lead = array('source' => 'quick', 'contact' => '@testing', 'name' => 'Тест', 'requestId' => 'test-request-01');
function hpExpect($condition, $message) { if (!$condition) throw new Exception($message); echo 'PASS ' . $message . "\n"; }
$r = homeporteAcceptLead(array(), $recipient, $storage, $sender, 'test');
hpExpect($r[0] === 400 && $calls === 0, 'invalid input does not send mail');
$r = homeporteAcceptLead($lead, $recipient, $storage, $sender, 'test');
hpExpect($r[0] === 200 && $calls === 1, 'valid lead delivered through sender');
$r = homeporteAcceptLead($lead, $recipient, $storage, $sender, 'test');
hpExpect($r[0] === 200 && $calls === 1, 'retry does not duplicate delivery');
$changed = $lead; $changed['name'] = 'Изменено';
hpExpect(homeporteAcceptLead($changed, $recipient, $storage, $sender, 'test')[0] === 409, 'request ID cannot be reused for different data');
for ($i = 2; $i <= 5; $i++) { $lead['requestId'] = 'test-request-0' . $i; homeporteAcceptLead($lead, $recipient, $storage, $sender, 'test'); }
$lead['requestId'] = 'test-request-06';
hpExpect(homeporteAcceptLead($lead, $recipient, $storage, $sender, 'test')[0] === 429 && $calls === 5, 'rate limit blocks excess requests');
$lead['requestId'] = 'test-failure-01';
hpExpect(homeporteAcceptLead($lead, $recipient, $storage, function () { return false; }, 'other')[0] === 503, 'mail failure is reported to visitor');
hpExpect(homeporteAcceptLead($lead, $recipient, $storage, $sender, 'other')[0] === 200 && $calls === 6, 'failed delivery can be retried');
foreach (glob($storage . '/lead-*.json') as $file) hpExpect(strpos(file_get_contents($file), '@testing') === false, 'receipt contains no contact details');
foreach (glob($storage . '/*') as $file) unlink($file);
rmdir($storage);
