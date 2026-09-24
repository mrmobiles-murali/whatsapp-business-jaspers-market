# Mr Mobiles WhatsApp automation

Mr Mobiles welcome menu and enquiry replies, adapted from Meta's Jasper's Market sample. This version follows the request to continue setup without adding a payment method.

## Implemented

- Bilingual welcome menu: phones, repairs, accessories, order/repair enquiries and shop contact.
- Signed webhook verification, a health endpoint and a Vercel Web Handler.
- Outbound messaging defaults to **disabled**. The only sending mode is **test**, restricted to a configured Meta test phone-number ID and an explicit list of the owner's verified recipients.
- Customer-initiated text/list replies within 24 hours of an incoming message. All template sends are blocked.
- No billing API, payment credentials, payment method creation, paid messaging provider or paid monitoring.
- Node's built-in test runner, with no runtime npm dependencies.

**This is prepared integration code, not proof of an activated WhatsApp account.** A successful deployment or health response does not verify Meta credentials, webhook subscription, phone ownership, message delivery or mobile app login.

## Run and test

Use Node.js 22.

~~~sh
cp .sample.env .env
npm test
npm start
~~~

The local server uses port 8080. Do not commit .env, access tokens, app secrets or verification tokens.

## Continue without adding payment details

1. Open your own Meta developer app's WhatsApp API setup. Use the **Meta-provided test number**, not a randomly typed number or your personal WhatsApp number. Meta documents that test accounts/numbers do not require a payment method.
2. Add your own receiving WhatsApp number as a test recipient and complete Meta's verification on your own device.
3. Set these values privately in the existing Vercel project's environment settings:

| Variable | Value |
| --- | --- |
| ACCESS_TOKEN | Token for the matching Meta test account; temporary tokens expire |
| APP_SECRET | Secret for the same Meta app |
| VERIFY_TOKEN | New random secret for the webhook handshake |
| TEST_PHONE_NUMBER_ID | Actual Meta test phone-number ID, not the displayed telephone number |
| TEST_RECIPIENTS | Your verified recipient digits with country code, comma separated, without a plus sign |
| SEND_MODE | test, only after checking the test number and recipient |
| GRAPH_API_VERSION | v23.0 |
| SHOP_ADDRESS | Confirmed shop address, otherwise Hosur, Tamil Nadu |

4. Redeploy. Use https://YOUR-EXISTING-DEPLOYMENT/webhook as the callback URL and your VERIFY_TOKEN. Subscribe to the messages webhook field for the correct WhatsApp account.
5. From your approved recipient, initiate a WhatsApp conversation with the test number. Check the welcome menu and its five choices. This is the end-to-end activation check.

No payment method should be added. If Meta requires billing for a production account, stop that production onboarding; this code does not bypass account requirements. Do not configure a production number as TEST_PHONE_NUMBER_ID. The application cannot independently attest that an ID is Meta's test number.

## Routes and deployment

- GET / and GET /health: server and local configuration status, without secrets.
- GET /webhook: Meta subscription challenge.
- POST /webhook: signed incoming events.
- /api/webhook: equivalent Vercel function route.

The existing GitHub-to-Vercel integration can deploy this repository. The build runs the test suite and maps the webhook routes to a Node.js Web Handler. Sensitive configuration belongs in Vercel environment variables; deployment does not populate it automatically.

The original Datadog example is disabled. This project does not provision another server, database or subscription.

## Current limits

This is a controlled test setup, not a production inbox. Replies provide enquiry guidance and contact details; they do not look up inventory, open repair tickets, retrieve order status, notify staff or collect payments. Confirm the supplied shop email and website are operational before customer use.

Duplicate suppression is bounded and stored in memory for one process. A restart or another serverless instance can repeat a reply. Production use requires durable idempotency, an authenticated inbox and confirmed Meta billing/number eligibility. Production sending is deliberately unsupported here.

This does not register a number in the WhatsApp Business mobile app, retrieve an SMS/voice OTP, or guarantee that the phone number will be hidden. Cloud API setup and mobile-app onboarding are separate tasks and must follow the account's supported Meta onboarding flow.

## Official references

- [Meta platform and test accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Meta getting started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
- [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)

## Attribution and license

Originally based on Meta's Jasper's Market WhatsApp example. The original repository license is retained in LICENSE. The Mr Mobiles implementation replaces the fictional grocery and template-promotion flows.
