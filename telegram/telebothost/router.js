// Paste into Logic of *, /start, /help, /settings and /stop. Answer stays empty.
// Runtime globals are supplied by TeleBotHost; this is not a Node server.
const incoming = update.callback_query;
const actor = incoming ? incoming.from : update.message && update.message.from;
const context = incoming ? incoming.message && incoming.message.chat : update.message && update.message.chat;
if (incoming) await Api.answerCallbackQuery({ callback_query_id: incoming.id });
if (!actor || !context || context.type !== 'private' || actor.id !== context.id) return;
const text = incoming ? incoming.data : (update.message.text || '');
const parts = text.trim().split(/\s+/);
const command = parts[0].split('@')[0];
const menu = [[{ text: 'خانه', callback_data: 'home' }]];
const display = async (text, keyboard) => {
  const payload = { chat_id: context.id, text, reply_markup: { inline_keyboard: keyboard } };
  if (incoming && incoming.message) {
    await Api.editMessageText({ ...payload, message_id: incoming.message.message_id });
  } else {
    await Api.sendMessage(payload);
  }
};
if (command === '/start' && parts[1]) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(parts[1])) {
    await display('پیوند معتبر نیست. از سایت پیوند تازه دریافت کنید.', menu);
    return;
  }
  // Token stays inside Telegram callback; it is never stored as customer history.
  await display('اتصال این گفت‌وگو به حساب یا رسید رزروی که در سایت انتخاب کردید را تأیید می‌کنید؟', [
    [{ text: 'تأیید اتصال', callback_data: 'link:' + parts[1] }],
    [{ text: 'انصراف', callback_data: 'home' }]
  ]);
  return;
}
let operation = ({ '/start': 'home', '/help': 'help', '/settings': 'settings', '/stop': 'stop' })[command] || text;
let token = '';
if (text.startsWith('link:')) { operation = 'confirm_link'; token = text.slice(5); }
if (!['home', 'help', 'settings', 'stop', 'marketing_off', 'appointments', 'benefits', 'contact', 'confirm_link'].includes(operation) && !/^(pref:(appointments|marketing|birthday|loyalty|care|manager_reports):[01]|ack:\d+|decline:\d+|snooze:\d+|rate:\d+:[1-5])$/.test(operation)) operation = 'help';
const backend = process.env.BAHARNAJ_BACKEND_URL;
const secret = process.env.BAHARNAJ_INTEGRATION_SECRET;
if (!backend || !backend.startsWith('https://') || !secret) {
  await display('اتصال سایت هنوز آماده نیست. لطفاً از وب‌سایت بهارناژ استفاده کنید.', menu);
  return;
}
const body = JSON.stringify({ update_id: String(update.update_id), actor: actor.id, chat_id: context.id, chat_type: context.type, username: actor.username || '', operation, token });
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = crypto.randomBytes(16).toString('hex');
const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
const signature = crypto.createHmac('sha256', secret).update(timestamp + '\n' + nonce + '\n' + bodyHash).digest('hex');
try {
  const res = await HTTP.post(backend.replace(/\/$/, '') + '/api/v1/telegram/bot/', {
    body,
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature },
    timeout: 10000
  });
  if (!res.ok || !res.data || typeof res.data.payload !== 'string' || typeof res.data.signature !== 'string') {
    await display('درخواست انجام نشد. پیوند ممکن است منقضی شده باشد؛ در سایت وضعیت را بررسی کنید و دوباره تلاش کنید.', menu);
    return;
  }
  const expected = crypto.createHmac('sha256', secret).update('response\n' + String(update.update_id) + '\n' + res.data.payload).digest('hex');
  if (expected !== res.data.signature) {
    await display('پاسخ معتبر دریافت نشد. دوباره از سایت بررسی کنید.', menu);
    return;
  }
  const result = JSON.parse(res.data.payload);
  await display(result.text, result.keyboard || menu);
} catch (_) {
  await display('ارتباط موقتاً برقرار نشد. کمی بعد دوباره تلاش کنید.', menu);
}
