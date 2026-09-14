<?php
// Shared-hosting transport. Loaded by the existing Moguta Ajaxuser class.
// Only delivery receipts and throttling counters are stored; no lead text is written to disk.
function homeporteAcceptLead($input, $recipient, $storage, $sendMail = null, $clientIp = null, $telegram = array(), $sendTelegram = null, $clock = null) {
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
    if (empty($telegram['token']) || empty($telegram['chat_ids']) || !is_array($telegram['chat_ids'])) {
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
    $now = $clock === null ? time() : $clock;
    $record = $storage . '/lead-' . hash('sha256', $input['requestId']) . '.json';
    $digest = hash('sha256', json_encode($input));
    $prior = is_file($record) ? json_decode(file_get_contents($record), true) : null;
    if ($prior && isset($prior['digest']) && $prior['digest'] !== $digest) {
        flock($lock, LOCK_UN); fclose($lock);
        return array(409, array('ok' => false, 'error' => 'Обновите страницу и отправьте изменённую заявку.'));
    }
    // Existing receipts from the mail-only release mean email was sent, not Telegram.
    $state = $prior ?: array('digest' => $digest, 'created' => $now);
    if (!isset($state['telegram'])) $state['telegram'] = array();
    if (!isset($state['mail_sent'])) $state['mail_sent'] = isset($state['accepted']);
    $chatIds = array_values(array_unique(array_map('strval', $telegram['chat_ids'])));
    $missing = array();
    foreach ($chatIds as $chatId) if (empty($state['telegram'][hash('sha256', $chatId)])) $missing[] = $chatId;
    $ip = $clientIp !== null ? $clientIp : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown');
    $rateFile = $storage . '/rate-' . hash('sha256', $ip) . '.json';
    $rate = is_file($rateFile) ? json_decode(file_get_contents($rateFile), true) : null;
    if (!$rate || $rate['start'] < $now - 600) $rate = array('start' => $now, 'count' => 0);
    $answer = null;
    if ($missing && $rate['count'] >= 5) $answer = array(429, array('ok' => false, 'error' => 'Слишком много попыток. Подождите 10 минут или позвоните +375 29 144-96-66.'));
    if ($answer === null) {
        if (!isset($state['number'])) {
            $date = new DateTimeImmutable('@' . $now);
            $month = $date->setTimezone(new DateTimeZone('Europe/Minsk'))->format('Y-m');
            $counterFile = $storage . '/counter-' . $month . '.json';
            $counter = is_file($counterFile) ? json_decode(file_get_contents($counterFile), true) : null;
            $seed = isset($telegram['counter_seed'][$month]) ? (int) $telegram['counter_seed'][$month] : 0;
            $state['number'] = max($seed, isset($counter['last']) ? (int) $counter['last'] : 0) + 1;
            $state['month'] = $month;
            if (file_put_contents($counterFile, json_encode(array('last' => $state['number'])), LOCK_EX) === false) $answer = array(503, array('ok' => false, 'error' => 'Повторите отправку позже.'));
            @chmod($counterFile, 0600);
        }
        if ($answer === null && !homeporteSaveReceipt($record, $state)) $answer = array(503, array('ok' => false, 'error' => 'Повторите отправку позже.'));
        $labels = array('name' => 'Имя', 'contact' => 'Контакт', 'item' => 'Изделие', 'qty' => 'Количество', 'stage' => 'Этап ремонта', 'comment' => 'Комментарий');
        $lines = array('Новая заявка HomePorte №' . $state['number'], 'Источник: ' . ($input['source'] === 'quiz' ? 'квиз' : 'обратный звонок'));
        foreach ($labels as $key => $label) if ($input[$key] !== '') $lines[] = $label . ': ' . $input[$key];
        $body = implode("\n", $lines);
        if ($answer === null && $missing) {
            $rate['count']++;
            file_put_contents($rateFile, json_encode($rate), LOCK_EX); @chmod($rateFile, 0600);
            foreach ($missing as $chatId) {
                try {
                    $sent = $sendTelegram !== null ? call_user_func($sendTelegram, $chatId, $body) : homeporteTelegramRequest('sendMessage', array('chat_id' => $chatId, 'text' => $body, 'disable_web_page_preview' => true), $telegram['token']);
                    if (empty($sent['message_id'])) throw new Exception('telegram_unconfirmed');
                    $state['telegram'][hash('sha256', $chatId)] = $sent['message_id'];
                    unset($state['last_error']);
                    if (!homeporteSaveReceipt($record, $state)) throw new Exception('receipt_write');
                } catch (Exception $error) {
                    $state['last_error'] = preg_match('/^[a-z0-9_]+$/D', $error->getMessage()) ? $error->getMessage() : 'telegram_unavailable';
                    homeporteSaveReceipt($record, $state);
                    $answer = array(503, array('ok' => false, 'error' => 'Не удалось подтвердить доставку заявки. Повторите отправку или позвоните +375 29 144-96-66.'));
                    break;
                }
            }
        }
        if ($answer === null) {
            $state['accepted'] = $now;
            if (!$state['mail_sent'] && filter_var($recipient, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/', $recipient)) {
                $subject = '=?UTF-8?B?' . base64_encode('Заявка HomePorte №' . $state['number']) . '?=';
                $headers = 'From: HomePorte <noreply@homeporte.by>' . "\r\n" . 'MIME-Version: 1.0' . "\r\n" . 'Content-Type: text/plain; charset=UTF-8';
                $state['mail_sent'] = $sendMail !== null ? (bool) call_user_func($sendMail, $recipient, $subject, $body, $headers) : @mail($recipient, $subject, $body, $headers);
            }
            homeporteSaveReceipt($record, $state);
            $answer = array(200, array('ok' => true, 'number' => $state['number']));
        }
    }
    // Monthly counters outlive receipt cleanup, so numbers never restart mid-month.
    foreach (array_merge(glob($storage . '/lead-*.json'), glob($storage . '/rate-*.json')) as $file) if (filemtime($file) < $now - 604800) @unlink($file);
    flock($lock, LOCK_UN); fclose($lock);
    return $answer;
}

function homeporteSaveReceipt($file, $state) {
    $saved = file_put_contents($file, json_encode($state), LOCK_EX) !== false;
    if ($saved) @chmod($file, 0600);
    return $saved;
}

function homeporteTelegramRequest($method, $payload, $token) {
    if (!in_array($method, array('sendMessage', 'getMe', 'getChat'), true)) throw new Exception('telegram_method');
    $url = 'https://api.telegram.org/bot' . $token . '/' . $method;
    $body = json_encode((object) $payload);
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, array(CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => array('Content-Type: application/json'), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 7, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_FOLLOWLOCATION => false));
        $response = curl_exec($curl);
        $code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
    } else {
        $context = stream_context_create(array('http' => array('method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => $body, 'timeout' => 7, 'ignore_errors' => true, 'follow_location' => 0), 'ssl' => array('verify_peer' => true, 'verify_peer_name' => true)));
        $response = @file_get_contents($url, false, $context);
        $code = 0;
    }
    $data = $response !== false ? json_decode($response, true) : null;
    if (!is_array($data) || empty($data['ok']) || !isset($data['result'])) {
        $errorCode = is_array($data) && isset($data['error_code']) ? (int) $data['error_code'] : (int) $code;
        throw new Exception('telegram_' . $errorCode);
    }
    return $data['result'];
}
