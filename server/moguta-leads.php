<?php
// Shared-hosting transport. Loaded by the existing Moguta Ajaxuser class.
// Only delivery receipts and throttling counters are stored; no lead text is written to disk.
function homeporteAcceptLead($input, $recipient, $storage, $sendMail = null, $clientIp = null) {
    if (!is_array($input)) return array(400, array('ok' => false, 'error' => 'Проверьте данные заявки.'));
    $limits = array('name' => 320, 'contact' => 320, 'comment' => 6400, 'item' => 400, 'qty' => 160, 'stage' => 400, 'source' => 20, 'requestId' => 80, 'website' => 400);
    foreach ($limits as $key => $limit) {
        if (isset($input[$key]) && (!is_string($input[$key]) || strlen($input[$key]) > $limit)) {
            return array(400, array('ok' => false, 'error' => 'Проверьте данные заявки.'));
        }
        $input[$key] = isset($input[$key]) ? trim($input[$key]) : '';
    }
    $contact = $input['contact'];
    $digits = preg_replace('/\D/', '', $contact);
    $phone = preg_match('/^\+?[\d\s()\-]+$/D', $contact) && strlen($digits) >= 7 && strlen($digits) <= 15;
    if ($input['website'] !== '' || !preg_match('/^[A-Za-z0-9_-]{8,80}$/D', $input['requestId']) ||
        !in_array($input['source'], array('quiz', 'quick'), true) ||
        (!$phone && !preg_match('/^@[A-Za-z][A-Za-z0-9_]{4,31}$/D', $contact))) {
        return array(400, array('ok' => false, 'error' => 'Введите телефон с кодом страны или Telegram в формате @username.'));
    }
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $recipient)) {
        return array(503, array('ok' => false, 'error' => 'Приём заявок временно недоступен. Позвоните +375 29 144-96-66.'));
    }
    if (!is_dir($storage) && !@mkdir($storage, 0700, true) && !is_dir($storage)) {
        return array(503, array('ok' => false, 'error' => 'Повторите отправку позже или позвоните +375 29 144-96-66.'));
    }
    @chmod($storage, 0700);
    $lock = @fopen($storage . '/lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) {
        if ($lock) fclose($lock);
        return array(503, array('ok' => false, 'error' => 'Повторите отправку позже.'));
    }
    $now = time();
    $record = $storage . '/lead-' . hash('sha256', $input['requestId']) . '.json';
    $digest = hash('sha256', json_encode($input));
    $prior = is_file($record) ? json_decode(file_get_contents($record), true) : null;
    $answer = null;
    if ($prior && isset($prior['digest'])) {
        $answer = $prior['digest'] === $digest
            ? array(200, array('ok' => true))
            : array(409, array('ok' => false, 'error' => 'Обновите страницу и отправьте изменённую заявку.'));
    }
    $ip = $clientIp !== null ? $clientIp : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown');
    $rateFile = $storage . '/rate-' . hash('sha256', $ip) . '.json';
    $rate = is_file($rateFile) ? json_decode(file_get_contents($rateFile), true) : null;
    if (!$rate || $rate['start'] < $now - 600) $rate = array('start' => $now, 'count' => 0);
    if ($answer === null && $rate['count'] >= 5) $answer = array(429, array('ok' => false, 'error' => 'Слишком много заявок. Подождите 10 минут или позвоните +375 29 144-96-66.'));
    if ($answer === null) {
        $rate['count']++;
        file_put_contents($rateFile, json_encode($rate), LOCK_EX);
        @chmod($rateFile, 0600);
        $labels = array('name' => 'Имя', 'contact' => 'Контакт', 'item' => 'Изделие', 'qty' => 'Количество', 'stage' => 'Этап ремонта', 'comment' => 'Комментарий');
        $lines = array('Новая заявка с homeporte.by', 'Форма: ' . ($input['source'] === 'quiz' ? 'Расчёт стоимости' : 'Обратная связь'));
        foreach ($labels as $key => $label) if ($input[$key] !== '') $lines[] = $label . ': ' . $input[$key];
        $subject = '=?UTF-8?B?' . base64_encode('Заявка HomePorte с сайта') . '?=';
        $headers = 'From: HomePorte <noreply@homeporte.by>' . "\r\n" . 'MIME-Version: 1.0' . "\r\n" . 'Content-Type: text/plain; charset=UTF-8' . "\r\n" . 'Content-Transfer-Encoding: 8bit';
        $body = implode("\n", $lines);
        $sent = $sendMail !== null ? call_user_func($sendMail, $recipient, $subject, $body, $headers) : @mail($recipient, $subject, $body, $headers);
        if ($sent) {
            file_put_contents($record, json_encode(array('digest' => $digest, 'accepted' => $now)), LOCK_EX);
            @chmod($record, 0600);
            $answer = array(200, array('ok' => true));
        } else {
            $answer = array(503, array('ok' => false, 'error' => 'Не удалось отправить заявку. Повторите позже или позвоните +375 29 144-96-66.'));
        }
    }
    // Bound the lifetime of non-sensitive receipts and rate counters.
    foreach (glob($storage . '/*.json') as $file) if (filemtime($file) < $now - 604800) @unlink($file);
    flock($lock, LOCK_UN);
    fclose($lock);
    return $answer;
}
