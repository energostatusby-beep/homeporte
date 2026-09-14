<?php
// Both transports are injected: tests never send real Telegram messages or email.
if (!function_exists('homeporteAcceptLead')) require __DIR__ . '/moguta-leads.php';
$storage = sys_get_temp_dir() . '/homeporte-test-' . uniqid();
$clock = strtotime('2026-09-14T18:00:00+03:00');
$config = array('token' => 'test-token', 'chat_ids' => array('-100testgroup', 'testperson'), 'counter_seed' => array('2026-09' => 3));
$tgCalls = array(); $mailCalls = 0; $failChat = ''; $mailFail = false;
$telegram = function ($chatId, $body) use (&$tgCalls, &$failChat) {
    if ($chatId === $failChat) throw new Exception('telegram_503');
    if (strpos($body, 'Новая заявка HomePorte №') !== 0 || strpos($body, '@testing') === false) throw new Exception('bad_message');
    $tgCalls[] = $chatId;
    return array('message_id' => count($tgCalls));
};
$mail = function ($to, $subject, $body, $headers) use (&$mailCalls, &$mailFail) { $mailCalls++; return !$mailFail; };
function hpExpect($ok, $message) { if (!$ok) throw new Exception($message); echo 'PASS ' . $message . "\n"; }
function hpLead($id) { return array('source' => 'quick', 'contact' => '@testing', 'name' => 'Тест', 'requestId' => $id); }
function hpRun($lead, $ip = 'default') {
    global $storage, $clock, $config, $telegram, $mail;
    return homeporteAcceptLead($lead, 'test@example.com', $storage, $mail, $ip, $config, $telegram, $clock);
}
hpExpect(hpRun(array())[0] === 400 && count($tgCalls) === 0 && $mailCalls === 0, 'invalid input sends nothing');
hpExpect(homeporteAcceptLead(hpLead('missing-config'), 'test@example.com', $storage)[0] === 503, 'missing Telegram config never reports success');
$r = hpRun(hpLead('valid-request-01'));
hpExpect($r[0] === 200 && $r[1]['number'] === 4 && count($tgCalls) === 2 && $mailCalls === 1, 'both Telegram recipients confirmed before success');
$r = hpRun(hpLead('valid-request-01'));
hpExpect($r[0] === 200 && count($tgCalls) === 2 && $mailCalls === 1, 'retry does not duplicate either recipient or email');
$changed = hpLead('valid-request-01'); $changed['name'] = 'Изменено';
hpExpect(hpRun($changed)[0] === 409, 'different payload cannot reuse request ID');
$failChat = 'testperson';
$r = hpRun(hpLead('partial-request-01'));
hpExpect($r[0] === 503 && count($tgCalls) === 3 && $mailCalls === 1, 'partial delivery never reports accepted');
$failChat = '';
$r = hpRun(hpLead('partial-request-01'));
hpExpect($r[0] === 200 && count($tgCalls) === 4 && end($tgCalls) === 'testperson' && $mailCalls === 2, 'partial retry only sends missing personal copy');
$failChat = '-100testgroup';
hpExpect(hpRun(hpLead('failed-request-01'))[0] === 503 && count($tgCalls) === 4, 'Telegram failure does not become mail-only success');
$failChat = '';
hpExpect(hpRun(hpLead('failed-request-01'))[0] === 200 && count($tgCalls) === 6, 'failed Telegram delivery can be retried');
$mailFail = true;
$r = hpRun(hpLead('mail-failure-01'), 'mail');
hpExpect($r[0] === 200 && count($tgCalls) === 8, 'Telegram confirmation remains successful if email copy fails');
$mailFail = false;
hpExpect(hpRun(hpLead('mail-failure-01'), 'mail')[0] === 200 && count($tgCalls) === 8, 'retrying email copy does not duplicate Telegram');
// A receipt from the previous production version only confirms email.
$file = $storage . '/lead-' . hash('sha256', 'valid-request-01') . '.json';
$old = json_decode(file_get_contents($file), true);
file_put_contents($file, json_encode(array('digest' => $old['digest'], 'accepted' => $clock)));
$beforeMail = $mailCalls;
hpExpect(hpRun(hpLead('valid-request-01'), 'legacy')[0] === 200 && count($tgCalls) === 10 && $mailCalls === $beforeMail, 'legacy email receipt still delivers missing Telegram copies');
$before = count($tgCalls);
for ($i = 1; $i <= 5; $i++) hpExpect(hpRun(hpLead('rate-request-0' . $i), 'rate')[0] === 200, 'valid request below rate limit');
hpExpect(hpRun(hpLead('rate-request-06'), 'rate')[0] === 429 && count($tgCalls) === $before + 10, 'rate limit stops extra messages');
$counter = $storage . '/counter-2026-09.json';
$last = json_decode(file_get_contents($counter), true)['last'];
touch($counter, $clock - 8 * 86400);
$clock += 8 * 86400;
$r = hpRun(hpLead('retention-request'), 'retention');
hpExpect($r[1]['number'] === $last + 1 && is_file($counter), 'receipt cleanup does not reset monthly counter');
$clock = strtotime('2026-09-30T21:00:01Z');
$r = hpRun(hpLead('october-request'), 'october');
hpExpect($r[1]['number'] === 1, 'number resets at Minsk month boundary');
$noContact = true;
foreach (glob($storage . '/*.json') as $file) if (strpos(file_get_contents($file), '@testing') !== false) $noContact = false;
hpExpect($noContact, 'receipts contain no lead contact text');
foreach (glob($storage . '/*') as $file) unlink($file);
rmdir($storage);
