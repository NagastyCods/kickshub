# KicksHub

Sneaker shop for customers in Ghana. Prices are in Ghana cedis (GHS, ₵). Paystack handles card and Mobile Money (MTN MoMo, Telecel Cash, AirtelTigo Money).

**Status: Phase 6 of 6.** The shop, admin dashboard, security hardening, and deployment notes are in place.

| Phase | What it adds |
| --- | --- |
| 1 | Setup, config, models, seed (this phase) |
| 2 | Auth, products, collections, cart APIs |
| 3 | Orders, Paystack / Mobile Money, webhooks, email |
| 4 | Customer storefront |
| 5 | Admin dashboard |
| 6 | Security hardening, test checklist, deployment polish |

The same Express app serves the shop at `/` and the JSON API at `/api`. Open `http://localhost:5000/` after `npm run dev`. Pricing, stock reservation, and payment idempotency live on the models so routes cannot invent their own rules.

## Folder structure

```
kickshub/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server/
    ├── app.js
    ├── server.js
    ├── config/
    │   ├── cloudinary.js
    │   ├── constants.js      regions, delivery fees, MoMo provider codes, size-agnostic enums
    │   ├── db.js
    │   ├── env.js
    │   └── sizes.js          EU / UK / US chart
    ├── middleware/
    │   └── errorHandler.js
    ├── models/
    │   ├── User.js
    │   ├── Product.js        variants, atomic stock updates
    │   ├── Collection.js
    │   ├── Brand.js
    │   ├── Cart.js
    │   ├── Order.js
    │   ├── Review.js
    │   ├── Wishlist.js
    │   ├── PromoCode.js
    │   ├── Settings.js
    │   ├── Transaction.js
    │   ├── Newsletter.js
    │   └── StockAlert.js
    ├── services/
    │   ├── inventory.js      reserve a set of lines, roll back if one fails
    │   └── pricing.js        prices are read from the database, never from the client
    ├── seed/
    │   ├── seed.js
    │   └── data/
    │       ├── catalog.js
    │       └── buildCatalog.js
    └── utils/
        ├── ApiError.js
        ├── apiResponse.js
        ├── asyncHandler.js
        ├── money.js          GHS cedis ↔ pesewas
        ├── orderNumber.js
        ├── phone.js
        └── transaction.js
```

`server/routes`, `server/controllers`, and `client/` are the storefront. `client/js` is vanilla ES modules (`api.js`, `auth.js`, `cart.js`, `ui.js`) plus one script per page. The admin dashboard is `client/admin.html` and `client/js/admin.js`, backed by `/api/admin`.

The product’s link to a collection is stored as `collectionId`. Mongoose already uses `collection` on every document, so that name cannot be a schema path.

## Requirements

- Node.js 18 or newer
- MongoDB 6 or newer, running locally or on [MongoDB Atlas](https://www.mongodb.com/atlas)

A replica set (Atlas is one) lets payment confirmation and stock updates commit in a single transaction. Standalone local MongoDB still works; stock updates stay atomic per product, and the order document uses a lock plus a per-line stock state so a retry does not sell the same pair twice.

## Setup

```powershell
cd D:\PROJECTS\kickshub
npm install
Copy-Item .env.example .env
```

Generate a real `JWT_SECRET` and paste it into `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `MONGO_URI`. Local MongoDB:

```
MONGO_URI=mongodb://127.0.0.1:27017/kickshub
```

Seed the catalog, then start the API:

```powershell
npm run seed
npm run dev
```

`npm start` runs the same server without reload. The seed **deletes** users, products, orders, carts, reviews, promos, and settings in the database named by `MONGO_URI`, then inserts the sample shop. Do not point it at a database you need to keep. In production the seed refuses to run unless `ALLOW_SEED=true`.

Check it:

```powershell
curl.exe http://localhost:5000/api/health
```

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "service": "kickshub",
    "time": "2026-10-18T19:00:00.000Z",
    "database": "connected"
  }
}
```

Every JSON response uses `{ success, message, data, errors?, meta? }`.

### Development logins

Printed again at the end of `npm run seed`. Defaults:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@kickshub.com | Admin@123456 |
| Customer | customer@kickshub.com | Customer@123456 |

Override them with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_EMAIL`, and `SEED_CUSTOMER_PASSWORD`. Change them before any public deploy. Log in at `/login`. A guest bag in the browser is merged into the account on login.

Promo codes in the seed: `WELCOME10` (10% off, max ₵150, minimum spend ₵200), `KICKS50` (₵50 off, minimum ₵400), `LEGEND15` (15% off, minimum ₵800). `LASTSEASON` is expired and `OLD20` is inactive, so checkout can prove it rejects them.

The catalog is 26 sneakers across Nike, Adidas, Puma, New Balance, Jordan, Converse, Vans, Reebok, and Asics. Photos are Unsplash placeholders. Some sizes are seeded with 3 left, and some are sold out, so stock badges have data. Sample images are not official product photography.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | no | `development` or `production` |
| `PORT` | no | API port, default `5000` |
| `CLIENT_URL` | no | Storefront origin for CORS and email links |
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes to boot the API | Signs auth cookies. 32+ characters in production |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `JWT_COOKIE_EXPIRES_DAYS` | no | Cookie lifetime, default `7` |
| `PAYSTACK_SECRET_KEY` | for payments | Secret key. Also the HMAC key for webhooks |
| `PAYSTACK_PUBLIC_KEY` | for payments | Public key used by the inline popup |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | for email | Nodemailer SMTP |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for hosted images | If empty, admin uploads will use local `uploads/` |
| `ARKESEL_API_KEY`, `ARKESEL_SENDER_ID` | no | SMS hook (Arkesel) |
| `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_SENDER_ID` | no | SMS / WhatsApp hook (Hubtel) |
| `RESERVATION_MINUTES_CARD` | no | How long a card checkout holds stock. Default 30 |
| `RESERVATION_MINUTES_MOMO` | no | Mobile money hold. Default 5 (the network prompt dies at about 180 seconds) |
| `ALLOW_SEED` | no | Must be `true` to seed when `NODE_ENV=production` |
| `SEED_ADMIN_*`, `SEED_CUSTOMER_*` | no | Seed account overrides |

Prices in MongoDB are cedis (`890` means ₵890.00). Paystack wants pesewas. `server/utils/money.js` converts: ₵10.50 → `1050`.

## Paystack

1. Create a business at [dashboard.paystack.com](https://dashboard.paystack.com) and switch the country to Ghana so the currency is GHS.
2. Open **Settings → API Keys & Webhooks**.
3. Copy the **test** keys into `.env` (`sk_test_...` and `pk_test_...`). Leave live keys out until the store is approved and you are ready to charge real wallets.
4. Test cards and mobile-money numbers are on [Paystack's test payments page](https://paystack.com/docs/payments/test-payments/). Expiry can be any future date. As of that page:

| Channel | Details |
| --- | --- |
| Card, no PIN | `4084084084084081`, CVV `408` |
| Card, PIN + OTP | `5060666666666666666`, CVV `123`, PIN `1234`, OTP `123456` |
| Card, declined | `4084080000005408`, CVV `001` |
| MTN MoMo | `0551234987`. No PIN and no OTP in test mode |

Paystack's published Ghana MoMo test number is the MTN one above. Telecel is provider code `vod` (the old Vodafone code). AirtelTigo Money is `atl`. The charge API is the same; you only change `mobile_money.provider`.

A Mobile Money charge returns `data.status: "pay_offline"` and `data.display_text`. The customer approves the prompt on their phone. The network gives them about **180 seconds**. The API waits for the `charge.success` webhook and also polls Paystack's verify endpoint.

### Webhook

Paystack signs the raw JSON body with **HMAC SHA512** using your secret key, and sends the hex digest in `x-paystack-signature`. Compare it to a digest you compute yourself. The parser in `server/app.js` already stores the raw buffer on `req.rawBody` so the signature is computed over the exact bytes.

```
POST https://<your-public-host>/api/payments/webhook
```

Locally, Paystack cannot call `localhost`. Use [ngrok](https://ngrok.com):

```powershell
ngrok http 5000
```

Put the HTTPS forwarding URL in the Paystack dashboard:

```
https://<subdomain>.ngrok-free.app/api/payments/webhook
```

Return `200` quickly. Paystack retries when it does not get one: in live mode, every 3 minutes for the first few tries, then hourly for 72 hours. The handler must be idempotent — the same `reference` is stored once on `Transaction`, and `Order.markPaid` no-ops when that reference is already paid.

Optional extra check: Paystack sends webhooks from `52.31.139.75`, `52.49.173.169`, and `52.214.14.220`. Signature verification is the check that matters; IP allow-lists break if those addresses change.

The webhook route is live. Point the Paystack dashboard at it once the site has a public HTTPS URL.

## How stock and money work

A variant stores three numbers:

- `stock` — pairs physically on hand
- `reserved` — pairs held for a checkout that has not been paid
- `available` — pairs a customer can still add (`stock - reserved`)

`Product.reserveStock` / `releaseStock` / `commitStock` each do the check and the update in one MongoDB `arrayFilters` write, so two checkouts cannot take the last pair.

1. Checkout calls `pricing.quoteOrder`. Unit prices are loaded from `Product`. The client total is ignored. On save, `Order` recomputes `subtotal`, `discount`, and `total`.
2. `inventory.reserveLines` holds every line. If one size is short, the lines already held are released.
3. The order is stored with `stockState: "reserved"` and `reservationExpiresAt`.
4. Paystack verify **and** the webhook call `Order.markPaid`. Stock is decremented only here (`commit`: `stock` and `reserved` both drop). A second call with the same reference returns `alreadyProcessed` and does not touch stock.
5. A failed or expired payment calls `releaseReservation`, which puts `available` back. If the money arrives after the order was cancelled, the order is flagged `needsRefundReview` instead of being shipped.

Card holds default to 30 minutes. Mobile money holds default to 5 minutes. Payment on delivery has no automatic expiry (`reservationExpiresAt` stays empty until an admin cancels or marks the order paid).

## API

Pages (HTML): `/`, `/shop`, `/product/:slug`, `/cart`, `/checkout`, `/order/:orderNumber`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/account`, `/wishlist`, `/contact`, `/faq`, `/shipping`. Unknown pages return `client/404.html`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | public | Process up, and whether MongoDB is connected |
| `POST` | `/api/auth/register` | public | Create an account and set the cookie |
| `POST` | `/api/auth/login` | public | Log in |
| `POST` | `/api/auth/logout` | public | Clear the cookie |
| `GET` | `/api/auth/me` | public | Current user, or `null` |
| `PATCH` | `/api/auth/me` | user | Update name and phone |
| `POST` | `/api/auth/forgot` | public | Email a reset link |
| `POST` | `/api/auth/reset` | public | Set a new password from the token |
| `POST` | `/api/auth/addresses` | user | Add an address |
| `PATCH` | `/api/auth/addresses/:id` | user | Update an address |
| `DELETE` | `/api/auth/addresses/:id` | user | Remove an address |
| `GET` | `/api/store` | public | Fees, cities, payment flags, size guide |
| `GET` | `/api/brands` | public | Active brands |
| `GET` | `/api/collections` | public | Active collections |
| `GET` | `/api/products` | public | Filter, sort, paginate |
| `GET` | `/api/products/suggest` | public | Search suggestions |
| `GET` | `/api/products/:slug` | public | Product and related pairs |
| `GET` | `/api/products/:slug/reviews` | public | Approved reviews |
| `POST` | `/api/products/:slug/reviews` | user | Verified buyers only; pending moderation |
| `GET` | `/api/cart` | user | Saved cart with live prices |
| `POST` | `/api/cart/price` | public | Price a guest cart |
| `POST` | `/api/cart/items` | user | Add a line |
| `PATCH` | `/api/cart/items/:variantId` | user | Change quantity |
| `DELETE` | `/api/cart/items/:variantId` | user | Remove a line |
| `POST` | `/api/cart/merge` | user | Merge a guest cart |
| `GET` | `/api/wishlist` | user | Saved products |
| `POST` | `/api/wishlist` | user | Save a product |
| `DELETE` | `/api/wishlist/:productId` | user | Remove a saved product |
| `POST` | `/api/checkout/quote` | public | Reprice lines, promo, and delivery |
| `POST` | `/api/orders` | public | Create an order and start payment |
| `GET` | `/api/orders` | user | The signed-in customer's orders |
| `GET` | `/api/orders/:orderNumber` | owner | Order detail. Guests pass `?email=` |
| `GET` | `/api/orders/:orderNumber/invoice` | owner | PDF. Guests pass `?token=` |
| `POST` | `/api/orders/:orderNumber/pay` | owner | Start payment again |
| `GET` | `/api/payments/verify/:reference` | public | Poll Paystack and settle the order |
| `POST` | `/api/payments/otp` | public | Submit a Mobile Money OTP |
| `POST` | `/api/payments/webhook` | Paystack | HMAC SHA512 of the raw body |
| `POST` | `/api/newsletter` | public | Footer signup |
| `POST` | `/api/stock-alerts` | public | Back-in-stock email |
| `POST` | `/api/contact` | public | Contact form |
| `GET` | `/api/admin/summary` | admin | Revenue, order counts, low stock |
| `GET` | `/api/admin/orders` | admin | Filter orders |
| `GET` | `/api/admin/orders/:orderNumber` | admin | Order detail |
| `PATCH` | `/api/admin/orders/:orderNumber/status` | admin | Move the order along |
| `POST` | `/api/admin/orders/:orderNumber/note` | admin | Add an internal note |
| `POST` | `/api/admin/orders/:orderNumber/paid` | admin | Mark an unpaid order paid and commit stock |
| `POST` | `/api/admin/orders/:orderNumber/refund` | admin | Record a refund, optionally restock |
| `GET` `POST` `PATCH` | `/api/admin/products` | admin | Catalog editing. Stock changes cannot drop below reserved units |
| `GET` `POST` `PATCH` | `/api/admin/brands` | admin | Brands |
| `GET` `POST` `PATCH` | `/api/admin/collections` | admin | Collections |
| `GET` `POST` `PATCH` | `/api/admin/promos` | admin | Promo codes |
| `GET` `PATCH` | `/api/admin/reviews` | admin | Moderate reviews |
| `GET` `PATCH` | `/api/admin/customers` | admin | Customers, and disable an account |
| `GET` | `/api/admin/newsletter` | admin | Newsletter list |
| `GET` | `/api/admin/stock-alerts` | admin | Back-in-stock signups |
| `GET` `PATCH` | `/api/admin/settings` | admin | Store details, payment toggles, delivery fees |
| `POST` | `/api/admin/uploads` | admin | JPG, PNG, or WebP up to 3 MB |

The auth cookie is `token`, httpOnly, sameSite lax. It is marked Secure only when the request itself is HTTPS, so a local `http://localhost:5000` login still works if `NODE_ENV` is `production`.

`Newsletter` and `StockAlert` back the footer signup and the back-in-stock form. They are not in the original model list and they are small on purpose.

## Security

- Helmet, CORS locked to `CLIENT_URL`, compression, and `hpp` (duplicate query keys keep one value).
- `express-mongo-sanitize` strips `$` and `.` from input. A second pass strips HTML tags from stored text. Password, reset token, and OTP fields are not rewritten, so a character like `<` in a password still matches.
- Auth routes are limited to 30 attempts per 15 minutes. The rest of `/api` is 300 per 15 minutes. Contact, newsletter, and back-in-stock forms are 8 per 15 minutes. The Paystack webhook is not counted, so retries are not dropped.
- Paystack signatures are HMAC SHA512 of the raw body, compared in constant time. A wrong length is a 401, not a crash.
- Order and contact emails escape names, addresses, and message text.
- Maintenance mode is a checkbox in **Admin → Settings**. Shoppers see a holding page and public API writes return 503. Login, order tracking, in-flight payment checks, the webhook, and `/admin` stay open. Admins who are already logged in can still browse the shop.

Run the automated checks (they do not touch the database):

```powershell
npm test
```

## Deployment

You can host the app on Render or Railway and the database on Atlas. The storefront is served by the same process, so `CLIENT_URL` should be that public origin (locally `http://localhost:5000`). `render.yaml` is a Render blueprint: it generates `JWT_SECRET` and expects you to fill `MONGO_URI`, `CLIENT_URL`, Paystack, and email. Set `CLIENT_URL` to the public `https://` origin, including the scheme. The app trusts one proxy hop, which matches Render and Railway.

### MongoDB Atlas

1. Create a free cluster.
2. Database Access: add a user with a password. Use that user in the URI, not your Atlas login.
3. Network Access: allow your IP for local dev. For Render or Railway, allow `0.0.0.0/0` or the host's egress list if you have one.
4. Connect → Drivers. The URI looks like `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/kickshub?retryWrites=true&w=majority`. The database name is `kickshub`.
5. Put it in `MONGO_URI`. If the password has `@` or `#`, URL-encode it.

### Render

1. New **Web Service**, connect this repo.
2. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
3. Add every variable from `.env.example`. Set `NODE_ENV=production`, a long `JWT_SECRET`, the Atlas `MONGO_URI`, and `CLIENT_URL` to the public `https://` origin.
4. Health check path: `/api/health`.
5. Set the Paystack webhook to `https://<service>.onrender.com/api/payments/webhook`.

The free Render instance sleeps. Paystack's webhook timeout is 30 seconds, which is usually enough for a cold start, but a paid instance is safer once you take real payments.

### Railway

1. New project → Deploy from GitHub.
2. Railway detects Node. Start command: `npm start`.
3. Variables: same set as `.env.example`, plus `PORT` if you want to pin it. Railway sets `PORT` for you; the server already reads it.
4. Generate a public domain and use that host for the webhook URL.

Do not run `npm run seed` against production unless you intend to wipe the shop. `ALLOW_SEED` defaults to false.

## Scripts

| Script | Command |
| --- | --- |
| `npm run dev` | API with reload (nodemon) |
| `npm start` | API, no reload |
| `npm run seed` | Wipe and reseed the catalog, settings, promos, and two users |
| `npm test` | Money, phone, signature, input cleaning, and maintenance rules. No database |

## License

Private project. Brand names belong to their owners; this seed uses them only as sample catalog data.
