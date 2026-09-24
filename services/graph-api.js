'use strict';

const { missingConfiguration } = require('./config');
const WINDOW_SECONDS = 24 * 60 * 60;

function eligible(message, phoneNumberId, config, now = Date.now()) {
  if (config.mode !== 'test' || missingConfiguration(config).length) return false;
  if (!/^\d{5,30}$/.test(config.testPhoneNumberId) || phoneNumberId !== config.testPhoneNumberId) return false;
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) return false;
  if (!message || !['text', 'interactive'].includes(message.type)) return false;
  if (typeof message.id !== 'string' || !message.id || message.id.length > 256) return false;
  if (typeof message.from !== 'string' || !/^\d{6,15}$/.test(message.from)) return false;
  if (!config.testRecipients.includes(message.from)) return false;
  const timestamp = Number(message.timestamp);
  const age = now / 1000 - timestamp;
  return Number.isFinite(timestamp) && timestamp > 0 && age >= -60 && age < WINDOW_SECONDS;
}

async function sendReply({ message, phoneNumberId, reply, config, fetchImpl = fetch, now = Date.now() }) {
  // Apply the policy at the final network boundary as well as at webhook intake.
  if (!eligible(message, phoneNumberId, config, now)) throw new Error('SEND_POLICY_BLOCKED');
  if (!reply || !['text', 'interactive'].includes(reply.type) || reply.template ||
      (reply.type === 'interactive' && reply.interactive?.type !== 'list')) {
    throw new Error('MESSAGE_TYPE_BLOCKED');
  }
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: message.from,
    context: { message_id: message.id },
    type: reply.type,
    ...(reply.type === 'text' ? { text: reply.text } : { interactive: reply.interactive })
  };
  const response = await fetchImpl('https://graph.facebook.com/' + config.graphVersion + '/' + config.testPhoneNumberId + '/messages', {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: 'Bearer ' + config.accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.messages?.[0]?.id) {
    // Never put the access token, phone number, message text or raw API error in logs.
    const code = Number(result.error?.code) || response.status;
    throw new Error('WHATSAPP_SEND_FAILED_' + code);
  }
  return result.messages[0].id;
}

module.exports = { eligible, sendReply, WINDOW_SECONDS };
