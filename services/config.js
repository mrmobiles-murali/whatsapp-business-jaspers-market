'use strict';

function readConfig(env = process.env) {
  const value = key => (env[key] || '').trim();
  return Object.freeze({
    mode: value('SEND_MODE') || 'disabled',
    accessToken: value('ACCESS_TOKEN'),
    appSecret: value('APP_SECRET'),
    verifyToken: value('VERIFY_TOKEN'),
    testPhoneNumberId: value('TEST_PHONE_NUMBER_ID'),
    testRecipients: value('TEST_RECIPIENTS').split(',').map(v => v.trim()).filter(Boolean),
    graphVersion: value('GRAPH_API_VERSION') || 'v23.0',
    email: 'contact@mrmobiles.in',
    website: 'https://mrmobiles.in',
    address: value('SHOP_ADDRESS') || 'Hosur, Tamil Nadu'
  });
}

function missingConfiguration(config) {
  const required = [
    ['ACCESS_TOKEN', config.accessToken], ['APP_SECRET', config.appSecret],
    ['VERIFY_TOKEN', config.verifyToken], ['TEST_PHONE_NUMBER_ID', config.testPhoneNumberId],
    ['TEST_RECIPIENTS', config.testRecipients.length]
  ];
  return required.filter(([, value]) => !value).map(([key]) => key);
}

module.exports = { readConfig, missingConfiguration };
