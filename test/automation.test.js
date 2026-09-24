'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createApp, signatureValid } = require('../app');
const { readConfig } = require('../services/config');
const { replyFor } = require('../services/replies');
const { eligible, sendReply } = require('../services/graph-api');

const NOW = Date.UTC(2026, 8, 24, 12);
const config = readConfig({
  SEND_MODE: 'test', ACCESS_TOKEN: 'test-token-never-used-on-network',
  APP_SECRET: 'unit-test-secret', VERIFY_TOKEN: 'unit-test-verify',
  TEST_PHONE_NUMBER_ID: '123456789012345', TEST_RECIPIENTS: '919000000001'
});
function message(overrides = {}) {
  return { id: 'wamid.test-1', from: '919000000001', timestamp: String(NOW / 1000 - 5),
    type: 'text', text: { body: 'Hi' }, ...overrides };
}
function event(messages = [message()], phoneNumberId = config.testPhoneNumberId) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages',
    value: { metadata: { phone_number_id: phoneNumberId }, messages } }] }] };
}
function signed(body, signature) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { 'content-type': 'application/json',
    'x-hub-signature-256': signature === undefined ? 'sha256=' + createHmac('sha256', config.appSecret).update(raw).digest('hex') : signature };
  return new Request('https://example.test/webhook', { method: 'POST', headers, body: raw });
}
function setup(overrides = {}) {
  const sent = [];
  const app = createApp({ config, clock: () => NOW, send: async args => { sent.push(args); }, ...overrides });
  return { app, sent };
}

test('outbound defaults to disabled and production mode cannot send', async () => {
  assert.equal(readConfig({}).mode, 'disabled');
  for (const mode of ['disabled', 'production']) {
    const { app, sent } = setup({ config: { ...config, mode } });
    assert.equal((await app(signed(event()))).status, 200);
    assert.equal(sent.length, 0);
    assert.equal(eligible(message(), config.testPhoneNumberId, { ...config, mode }, NOW), false);
  }
});

test('health does not claim activation or reveal credentials', async () => {
  const { app } = setup();
  const response = await app(new Request('https://example.test/health'));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(text).whatsapp_connection, 'not_verified_by_health_check');
  assert.equal(JSON.parse(text).production_messaging, 'blocked');
  assert.ok(!text.includes(config.accessToken) && !text.includes(config.appSecret) && !text.includes(config.testRecipients[0]));
});

test('verification requires exact token, subscribe mode and challenge', async () => {
  const { app } = setup();
  const url = 'https://example.test/webhook?hub.mode=subscribe&hub.verify_token=unit-test-verify&hub.challenge=12345';
  const valid = await app(new Request(url));
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), '12345');
  assert.equal((await app(new Request(url.replace('unit-test-verify', 'wrong')))).status, 403);
  assert.equal((await app(new Request(url.replace('subscribe', 'other')))).status, 403);
  assert.equal((await app(new Request(url.replace('12345', '')))).status, 403);
  const unconfigured = setup({ config: { ...config, verifyToken: '' } }).app;
  assert.equal((await unconfigured(new Request(url))).status, 503);
});

test('missing, incorrect and tampered signatures cannot trigger sending', async () => {
  const { app, sent } = setup();
  assert.equal((await app(signed(event(), ''))).status, 401);
  assert.equal((await app(signed(event(), 'sha256=' + '0'.repeat(64)))).status, 401);
  const signature = 'sha256=' + createHmac('sha256', config.appSecret).update(JSON.stringify(event())).digest('hex');
  assert.equal((await app(signed(event([message({ text: { body: 'Changed' } })]), signature))).status, 401);
  assert.equal(signatureValid(Buffer.from('{}'), 'sha256=garbage', config.appSecret), false);
  assert.equal(sent.length, 0);
});

test('malformed or oversized signed payloads are rejected', async () => {
  const { app, sent } = setup();
  for (const value of ['{broken', 'null', '{}', JSON.stringify({ object: 'whatsapp_business_account', entry: {} })]) {
    assert.equal((await app(signed(value))).status, 400);
  }
  assert.equal((await app(signed('x'.repeat(1024 * 1024 + 1)))).status, 413);
  assert.equal(sent.length, 0);
});

test('welcome and five choices produce Mr Mobiles service replies', async () => {
  const { app, sent } = setup();
  assert.equal((await app(signed(event()))).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].reply.type, 'interactive');
  assert.match(sent[0].reply.interactive.body.text, /Mr Mobiles/);
  for (const id of ['phones', 'repairs', 'accessories', 'status', 'contact']) {
    const reply = replyFor(message({ type: 'interactive', interactive: { list_reply: { id } } }), config);
    assert.equal(reply.type, 'text');
    assert.ok(reply.text.body.includes(config.email));
    assert.equal(reply.template, undefined);
  }
  assert.match(replyFor(message({ text: { body: '2' } }), config).text.body, /Repair enquiries/);
  assert.match(replyFor(message({ type: 'interactive', interactive: { button_reply: { id: 'phones' } } }), config).text.body, /Phone enquiries/);
  for (const id of ['', 'constructor', '__proto__']) {
    assert.equal(replyFor(message({ type: 'interactive', interactive: { list_reply: { id } } }), config).type, 'interactive');
  }
});

test('wrong sender ID or recipient cannot trigger a reply', async () => {
  const { app, sent } = setup();
  await app(signed(event([message({ from: '919000000002' })])));
  await app(signed(event([message()], '999999999999999')));
  assert.equal(sent.length, 0);
});

test('expired, missing and future timestamps cannot trigger replies', async () => {
  const { app, sent } = setup();
  for (const timestamp of [undefined, 'bad', String(NOW / 1000 - 86400), String(NOW / 1000 + 120)]) {
    await app(signed(event([message({ timestamp })])));
  }
  assert.equal(sent.length, 0);
});

test('status callbacks and unsupported media do not send follow-ups', async () => {
  const { app, sent } = setup();
  await app(signed({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages',
    value: { statuses: [{ status: 'read', id: 'outbound-id' }] } }] }] }));
  await app(signed(event([message({ type: 'image' }), null])));
  assert.equal(sent.length, 0);
});

test('repeated and concurrent deliveries are deduplicated in one process', async () => {
  const { app, sent } = setup();
  await Promise.all([app(signed(event())), app(signed(event()))]);
  await app(signed(event()));
  assert.equal(sent.length, 1);
});

test('webhook waits for reply completion', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  let entered;
  const start = new Promise(resolve => { entered = resolve; });
  const { app } = setup({ send: async () => { entered(); await gate; } });
  let returned = false;
  const response = app(signed(event())).then(value => { returned = true; return value; });
  await start;
  assert.equal(returned, false);
  finish();
  assert.equal((await response).status, 200);
});

test('failed sends are retried while successful batch members are suppressed', async () => {
  const attempts = {};
  const { app } = setup({ send: async ({ message: msg }) => {
    attempts[msg.id] = (attempts[msg.id] || 0) + 1;
    if (msg.id === 'second' && attempts[msg.id] === 1) throw new Error('mock failure');
  } });
  const body = event([message(), message({ id: 'second' })]);
  assert.equal((await app(signed(body))).status, 503);
  assert.equal((await app(signed(body))).status, 200);
  assert.deepEqual(attempts, { 'wamid.test-1': 1, second: 2 });
});

test('Graph boundary blocks templates, disabled mode and unapproved recipients before networking', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Unexpected network'); };
  const args = { config, message: message(), phoneNumberId: config.testPhoneNumberId, now: NOW, fetchImpl };
  await assert.rejects(sendReply({ ...args, reply: { type: 'template', template: { name: 'offer' } } }), /MESSAGE_TYPE_BLOCKED/);
  await assert.rejects(sendReply({ ...args, config: { ...config, mode: 'disabled' }, reply: replyFor(message(), config) }), /SEND_POLICY_BLOCKED/);
  await assert.rejects(sendReply({ ...args, message: message({ from: '919000000002' }), reply: replyFor(message(), config) }), /SEND_POLICY_BLOCKED/);
  assert.equal(calls, 0);
});

test('Graph request uses fixed HTTPS endpoint and original approved recipient', async () => {
  let seen;
  const fetchImpl = async (url, options) => { seen = { url, options }; return Response.json({ messages: [{ id: 'mock-outgoing' }] }); };
  const id = await sendReply({ config, message: message(), phoneNumberId: config.testPhoneNumberId, now: NOW, fetchImpl,
    reply: { ...replyFor(message(), config), to: '919000000099' } });
  assert.equal(id, 'mock-outgoing');
  assert.equal(seen.url, 'https://graph.facebook.com/v23.0/123456789012345/messages');
  assert.equal(seen.options.redirect, 'error');
  const body = JSON.parse(seen.options.body);
  assert.equal(body.to, message().from);
  assert.equal(body.type, 'interactive');
  assert.equal(body.template, undefined);
});

test('Graph errors omit raw customer data and credentials', async () => {
  await assert.rejects(sendReply({ config, message: message(), phoneNumberId: config.testPhoneNumberId, now: NOW,
    reply: replyFor(message(), config),
    fetchImpl: async () => Response.json({ error: { code: 190, message: 'sensitive raw error' } }, { status: 401 })
  }), { message: 'WHATSAPP_SEND_FAILED_190' });
});

test('Vercel Web Handler entrypoint loads and serves health', async () => {
  const { default: handler } = await import('../api/webhook.mjs');
  const response = await handler.fetch(new Request('https://example.test/'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'Mr Mobiles WhatsApp automation');
});
