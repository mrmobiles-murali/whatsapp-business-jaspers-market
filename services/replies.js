'use strict';

const rows = [
  { id: 'phones', title: 'Buy a phone', description: 'Model and budget enquiries' },
  { id: 'repairs', title: 'Phone repairs', description: 'Diagnosis and repair enquiries' },
  { id: 'accessories', title: 'Accessories', description: 'Chargers, cases and more' },
  { id: 'status', title: 'Order / repair status', description: 'How to request an update' },
  { id: 'contact', title: 'Contact the shop', description: 'Email and visit Mr Mobiles' }
];

function intent(message) {
  if (message.type === 'interactive') {
    return message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || 'menu';
  }
  const text = String(message.text?.body || '').trim().toLowerCase();
  const aliases = {
    '1': 'phones', phone: 'phones', phones: 'phones', buy: 'phones', mobile: 'phones',
    '2': 'repairs', repair: 'repairs', repairs: 'repairs', service: 'repairs',
    '3': 'accessories', accessories: 'accessories', charger: 'accessories',
    '4': 'status', status: 'status', order: 'status',
    '5': 'contact', contact: 'contact', human: 'contact', agent: 'contact',
    'வணக்கம்': 'menu', 'போன்': 'phones', 'ரிப்பேர்': 'repairs'
  };
  return aliases[text] || 'menu';
}

function replyFor(message, config) {
  const suffix = '\n\nReply MENU to see all options. / MENU அனுப்பவும்.';
  const messages = {
    phones: 'Mr Mobiles • Phone enquiries\n\nபுதிய மொபைல் வாங்க வேண்டுமா?\nFor model availability and a current quote, email your preferred model, RAM/storage and budget to ' + config.email + '.\nBrowse: ' + config.website + '\nPrices and stock are confirmed by the shop.',
    repairs: 'Mr Mobiles • Repair enquiries\n\nமொபைல் பழுது பார்க்க உதவி வேண்டுமா?\nEmail your phone model and the fault to ' + config.email + ', or visit us in ' + config.address + '.\nRepair cost and timing are confirmed after diagnosis. Please do not share your device PIN, passwords or OTPs.',
    accessories: 'Mr Mobiles • Accessories\n\nசார்ஜர், கேஸ் மற்றும் accessories.\nFor compatible chargers, cables, cases and audio accessories, email your phone model and the item you need to ' + config.email + '.\nThe shop will confirm availability and price.',
    status: 'Mr Mobiles • Order and repair updates\n\nஉங்கள் order / repair நிலை அறிய:\nEmail your order or job reference to ' + config.email + ', or contact the shop directly. The team will check the current status.\nThis message does not confirm a booking, payment or repair completion.',
    contact: 'Mr Mobiles • Contact\n\nவணக்கம்! Contact our shop team:\nEmail: ' + config.email + '\nWebsite: ' + config.website + '\nVisit: ' + config.address
  };
  const selected = intent(message);
  if (Object.hasOwn(messages, selected)) return { type: 'text', text: { preview_url: false, body: messages[selected] + suffix } };
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: 'Welcome to Mr Mobiles! வணக்கம்!\n\nHow can we help you today?\nChoose an option below or reply with a number from 1 to 5.' },
      action: { button: 'Choose a service', sections: [{ title: 'Mr Mobiles', rows }] }
    }
  };
}

module.exports = { intent, replyFor };
