'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const { readConfig, missingConfiguration } = require('./services/config');
const { replyFor } = require('./services/replies');
const { eligible, sendReply } = require('./services/graph-api');

const MAX_BODY_BYTES = 1024 * 1024;
const CACHE_LIMIT = 2000;
const CACHE_TTL = 24 * 60 * 60 * 1000;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signatureValid(raw, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  return safeEqual(signature, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
}

function createApp({ config = readConfig(), send = sendReply, clock = Date.now } = {}) {
  // Test-mode retry suppression only. A production integration needs a durable store.
  const completed = new Map();
  const pending = new Map();
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

  async function processMessage(message, phoneNumberId) {
    if (!eligible(message, phoneNumberId, config, clock())) return;
    const key = phoneNumberId + ':' + message.id;
    for (const [id, expires] of completed) if (expires <= clock()) completed.delete(id);
    if (completed.has(key)) return;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      await send({ message, phoneNumberId, reply: replyFor(message, config), config, now: clock() });
      completed.set(key, clock() + CACHE_TTL);
      if (completed.size > CACHE_LIMIT) completed.delete(completed.keys().next().value);
    })();
    pending.set(key, work);
    try { await work; } finally { pending.delete(key); }
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const webhook = ['/webhook', '/api/webhook'].includes(url.pathname);
    if (request.method === 'GET' && !url.searchParams.has('hub.mode') &&
        ['/', '/health', '/healthz', '/api/webhook'].includes(url.pathname)) {
      const missing = missingConfiguration(config);
      return json({
        service: 'Mr Mobiles WhatsApp automation',
        server: 'running',
        outbound: config.mode === 'test' && missing.length === 0 ? 'test_recipients_only' : 'disabled',
        configured: missing.length === 0,
        whatsapp_connection: 'not_verified_by_health_check',
        payment_setup: 'not_implemented',
        template_messages: 'blocked',
        production_messaging: 'blocked'
      });
    }
    if (!webhook) return json({ error: 'Not found' }, 404);
    if (request.method === 'GET') {
      if (!config.verifyToken) return json({ error: 'Webhook verification is not configured' }, 503);
      const challenge = url.searchParams.get('hub.challenge');
      if (url.searchParams.get('hub.mode') !== 'subscribe' ||
          !safeEqual(url.searchParams.get('hub.verify_token'), config.verifyToken) ||
          !challenge || !/^\d{1,128}$/.test(challenge)) return json({ error: 'Forbidden' }, 403);
      return new Response(challenge, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!config.appSecret) return json({ error: 'Webhook signature verification is not configured' }, 503);
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);
    if (!signatureValid(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) return json({ error: 'Invalid signature' }, 401);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (body?.object !== 'whatsapp_business_account') return json({ error: 'Unsupported event' }, 400);
    if (!Array.isArray(body.entry)) return json({ error: 'Invalid event' }, 400);
    const jobs = [];
    for (const entry of body.entry) {
      if (!Array.isArray(entry?.changes)) continue;
      for (const change of entry.changes) {
        if (change?.field !== 'messages') continue;
        const value = change.value;
        if (!Array.isArray(value?.messages)) continue; // Delivery/read statuses never trigger a message.
        for (const message of value.messages) jobs.push([message, value.metadata?.phone_number_id]);
      }
    }
    if (jobs.length > 100) return json({ error: 'Too many messages' }, 413);
    if (config.mode !== 'test') return json({ received: true, outbound: 'disabled' });
    if (missingConfiguration(config).length) return json({ error: 'Test messaging is not configured' }, 503);
    const results = await Promise.allSettled(jobs.map(([message, id]) => processMessage(message, id)));
    // Wait for outbound work before acknowledging; serverless runtimes can stop after return.
    if (results.some(result => result.status === 'rejected')) return json({ error: 'Reply failed; webhook may be retried' }, 503);
    return json({ received: true });
  };
}

module.exports = { fetch: createApp(), createApp, signatureValid };
