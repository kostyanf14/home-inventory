# Home Inventory System Plan

## 1. Goal

Build a system that helps a user understand:

- where an object is stored
- what items exist in a location
- medicine quantity and expiration dates
- food quantity and best-by / expiration dates (canned goods, jars, dry pantry items)
- equipment buy date and warranty expiration
- product details by scanning a barcode

The system should support two location levels:

1. `Site` - home, office, warehouse, apartment, etc.
2. `Place` - kitchen, bedroom closet, garage shelf, first aid kit drawer, etc.

The system should work well on:

- web
- iOS
- Android

## 2. Main Use Cases

### Medicine

- View what is inside a first aid kit
- Track medicine quantity
- Track expiration date
- Get alerts before expiration
- Search where a medicine is stored

### Food

- View what is in the pantry
- Track food quantity (cans, jars, packs)
- Track best-by / expiration date
- Use one unit (same as medicine)
- Search where a food item is stored

### Equipment

- View where equipment is located
- Track buy date
- Track warranty expiration date
- Store receipt/invoice/photo/manual
- Search equipment by name, barcode, brand, or room

### Shared

- Create and manage sites and places
- Add objects manually
- Add objects by barcode scan
- Use local cache/offline support on mobile
- Sync data with backend

## 3. Architecture Analysis

There are three realistic architecture options.

### Option A: Web App Only + API

**Description**

- Responsive web app for desktop and mobile browsers
- Separate backend API

**Pros**

- Lowest initial development cost
- One UI codebase
- Easy admin usage on desktop

**Cons**

- Barcode scanning is less reliable than native mobile
- Offline support is weaker
- Push notifications and camera integration are less consistent
- App-store distribution is not native

**Assessment**

This is the best fit for the requested MVP because it delivers the core inventory workflows quickly and keeps implementation cost lower than building mobile immediately.

### Option B: Web App + Mobile App + API

**Description**

- Web frontend for desktop/mobile browser
- Native-style mobile app for iOS and Android
- Shared backend API

**Pros**

- Best UX for barcode scanning
- Best support for camera, notifications, and offline sync
- Web is convenient for bulk editing and reporting

**Cons**

- Higher implementation cost than web-only
- Two UI applications to maintain from the beginning

**Assessment**

This is the best long-term product shape, but not the best starting point if the first goal is to launch an MVP faster with API + web only.

### Option C: Mobile-First App Only + API

**Description**

- Mobile app for iOS and Android
- Shared backend API
- No web app in MVP

**Pros**

- Fastest path to barcode-driven workflow
- Lower UI scope than web + mobile

**Cons**

- No comfortable desktop management experience
- Harder to review large inventory sets
- Less convenient for reports, exports, and admin flows

**Assessment**

This is not aligned with the requested MVP because the current priority is web first, not mobile first.

## 4. Recommended Solution

Recommend **Option A for MVP** with a **single backend** and **one primary client**:

- `API backend`
- `Web app`

Then add:

- `Mobile app for iOS/Android` in phase 2

To reduce complexity, build this as a **polyglot monorepo/workspace**:

- Python backend
- React web app
- future React Native mobile app

### Why this is the best fit

- It matches the requested MVP: API + web first.
- Web is better for setup, browsing, bulk editing, reporting, and early validation of the domain model.
- A single backend keeps business rules centralized.
- React on web keeps the UI approach closer to a future React Native mobile app.
- Mobile can be added after the data model and barcode lookup flows are stable.

## 5. Recommended Technology Stack

### Languages

- **Python** for backend
- **TypeScript** for web and future mobile

### Workspace

- **Monorepo** with separate backend and frontend applications
- **Turborepo** is optional for frontend package orchestration, but not required for the Python backend

Suggested structure:

```text
apps/
  api/
  web/
packages/
  api-contract/
  api-client/
  config/
```

Add `apps/mobile/` later in phase 2.

### Backend

- **Python** runtime
- **FastAPI** for API architecture
- **SQLAlchemy 2.x** as ORM
- **Alembic** for migrations
- **PostgreSQL** as primary database
- **Redis** optional later for queues/cache/background jobs

Why FastAPI:

- Strong fit for API-first system`s
- Fast to build CRUD, validation, and integration workflows
- Clear OpenAPI generation for web and future mobile clients
- Good long-term maintainability for a backend that serves multiple clients

If Ruby is preferred instead of Python, **Ruby on Rails** is the main alternative. For this project, **FastAPI** is the recommended default because the product is API-first and should later support both web and mobile clients cleanly.

### Web App

- **React**
- **TypeScript**
- **Vite**
- **React Router**
- **TanStack Query**
- **Tailwind CSS**

Why:

- Good admin-style UX on desktop
- Mature ecosystem
- Keeps the UI stack aligned with future React Native work
- Easy deployment

### Mobile App

- **React Native with Expo** in phase 2
- **Expo Router**
- **Camera/barcode scanning support**
- **Local cache/offline support**

Why:

- One mobile codebase for iOS and Android
- Good camera and device support
- Easier app-store distribution than hybrid web wrappers
- Can be added later without changing the backend architecture

### Authentication

- Email + password initially
- Social login optional later
- JWT access tokens + refresh tokens

### File Storage

- **S3-compatible object storage** for receipts, manuals, and item photos

Examples:

- AWS S3
- Cloudflare R2
- Supabase Storage

### Notifications

- Mobile push notifications for expiration and warranty reminders
- Email reminders optional later

## 6. Database Design

The data model should distinguish:

- product catalog information
- a concrete owned item in inventory
- location hierarchy
- medicine-specific data
- food-specific data
- equipment-specific data

### Core Entities

#### users

- `id`
- `email`
- `password_hash`
- `name`
- `created_at`

#### sites

Represents top-level locations.

- `id`
- `user_id`
- `name` - e.g. `Home`, `Main Office`
- `type` - e.g. `home`, `office`, `storage`
- `address_line_1`
- `address_line_2`
- `city`
- `state`
- `postal_code`
- `country`
- `notes`
- `created_at`
- `updated_at`

#### places

Represents exact places inside a site.

- `id`
- `site_id`
- `name` - e.g. `Kitchen`, `Hall Closet`, `Desk Drawer`
- `type` - e.g. `room`, `cabinet`, `drawer`, `box`, `kit`
- `parent_place_id` nullable
- `notes`
- `created_at`
- `updated_at`

Note: even though the business requirement says two location levels, keeping `parent_place_id` makes the design flexible for future detail like `Kitchen -> Cabinet -> Shelf`. The UI can still expose only two levels in MVP.

#### products

Represents normalized catalog data.

- `id`
- `name`
- `brand`
- `category`
- `barcode`
- `manufacturer`
- `default_unit`
- `image_url`
- `source` - `manual`, `open_db`, `user`
- `source_external_id` nullable
- `created_at`
- `updated_at`

#### inventory_items

Represents a concrete owned object.

- `id`
- `user_id`
- `product_id` nullable
- `site_id`
- `place_id`
- `item_type` - `medicine`, `equipment`, `food`, `other`
- `display_name`
- `barcode` nullable
- `quantity`
- `unit`
- `status` - `active`, `used`, `disposed`, `missing`
- `notes`
- `photo_url` nullable
- `created_at`
- `updated_at`

#### medicine_details

One-to-one with `inventory_items` where `item_type = medicine`.

- `inventory_item_id`
- `expiration_date`
- `dosage` nullable
- `form` nullable - tablet, spray, ointment
- `requires_prescription` boolean
- `batch_number` nullable

#### food_details

One-to-one with `inventory_items` where `item_type = food`.

- `inventory_item_id`
- `expiration_date`
- `form` nullable - canned, jar, dry, frozen

#### equipment_details

One-to-one with `inventory_items` where `item_type = equipment`.

- `inventory_item_id`
- `serial_number` nullable
- `buy_date` nullable
- `warranty_expiration_date` nullable
- `model_number` nullable
- `vendor_name` nullable
- `receipt_file_url` nullable

#### item_documents

- `id`
- `inventory_item_id`
- `document_type` - `receipt`, `manual`, `photo`, `warranty`
- `file_url`
- `created_at`

#### reminders

- `id`
- `inventory_item_id`
- `reminder_type` - `medicine_expiration`, `food_expiration`, `warranty_expiration`
- `trigger_date`
- `status` - `pending`, `sent`, `dismissed`
- `created_at`

#### scan_history

- `id`
- `user_id`
- `barcode`
- `source` - `local`, `external`, `manual`
- `result_status` - `matched`, `not_found`, `partial`
- `created_at`

### Important Modeling Decision

For medicine, a single `quantity` field is enough for MVP. If later the same medicine can exist in multiple expiration batches in the same place, add an `inventory_batches` table:

- `inventory_item_id`
- `quantity`
- `expiration_date`
- `batch_number`

That extension should be planned but not necessarily built in version 1 unless batch-level tracking is required immediately.

## 7. Barcode Strategy

Barcode support should use three data sources in this order:

1. **Local application product catalog**
2. **User-created products from prior scans**
3. **External/open barcode databases**

### Recommendation

Treat barcode lookup as a **product prefill helper**, not as the system of record.

Reason:

- Open databases for food are common, but medicine and equipment coverage is inconsistent.
- Barcode records often miss expiration, warranty, or local naming details.
- Many home/office objects either have no barcode or the barcode is not in a public database.

### External Data Sources to Evaluate

- **Open Food Facts / Open Products Facts**
- **UPCitemdb**
- **EAN/GTIN lookup providers**
- country-specific medicine registries if needed later

### Practical MVP Flow

1. Scan barcode
2. Check local DB first
3. If not found, call external lookup provider
4. If found, prefill name/brand/image/category
5. User confirms and adds missing details
6. Save product locally for future scans

### MVP Scope Note

For the first release, barcode support can be implemented in one of two ways:

1. user enters barcode number manually in web and receives prefilled product data
2. browser camera scanning is added only if it is cheap and reliable enough

The important requirement for MVP is barcode-based lookup and prefill, not full mobile-grade camera scanning.

## 8. API Design

Suggested API modules:

- `auth`
- `users`
- `sites`
- `places`
- `products`
- `inventory-items`
- `medicine`
- `equipment`
- `barcode`
- `documents`
- `reminders`

Example endpoints:

```text
POST   /auth/register
POST   /auth/login

GET    /sites
POST   /sites
GET    /sites/:id/places
POST   /places

GET    /inventory-items
POST   /inventory-items
GET    /inventory-items/:id
PATCH  /inventory-items/:id
DELETE /inventory-items/:id
POST   /inventory-items/:id/use

POST   /barcode/lookup
POST   /barcode/scan-result/save

GET    /reminders
POST   /documents/upload
```

## 9. UI Scope

### Mobile App

Primary workflows:

- scan barcode
- add item quickly
- move item to another place
- see what is in a place
- get medicine and warranty alerts

Primary screens:

- sign in
- dashboard
- sites list
- places list
- place details
- item details
- add item flow
- barcode scanner
- reminders
- search

Note: mobile is **not** part of MVP. These screens are for phase 2 planning only.

### Web App

Primary workflows:

- create sites and places
- bulk review inventory
- edit item details faster with keyboard/mouse
- filter by expiring medicines, food, or warranty
- upload documents and receipts

Primary screens:

- dashboard
- sites and places management
- inventory table (responsive; card layout on small screens)
- medicine expiration view
- food / pantry view
- equipment warranty view
- item details/edit page
- reports/export

## 10. Offline and Sync Strategy

Offline-first support is **not required for MVP** because the first release is web-based.

The initial release should assume an online connection and keep the sync model simple.

### MVP Approach

- Standard web session with server-backed persistence
- Optional browser caching for performance only
- No complex offline editing in version 1

### Sync Rules

- Server is the source of truth
- Each record has `updated_at`
- No offline conflict resolution is needed in MVP

Later, this can evolve into mobile offline sync when the React Native app is introduced.

## 11. Security and Access

### MVP

- Single-user or small household model
- Each user owns their own sites and inventory

### Later

- shared household/workspace access
- role-based permissions
- invite members to a site

## 12. Reporting and Notifications

### Reports

- medicines expiring in next 30/60/90 days
- food expiring in next 30/60/90 days
- equipment warranty expiring soon
- all items by site
- all items by place

### Notifications

- in-app reminder in dashboard for expiring medicine
- in-app reminder in dashboard for expiring food
- in-app reminder in dashboard for expiring warranties
- email reminders optional later
- push notifications later with mobile app

## 13. Development Phases

### Phase 1: Foundation

- create monorepo
- set up API and web apps
- configure auth
- design database schema
- implement core CRUD for sites and places

### Phase 2: Inventory Core

- implement products and inventory items
- implement medicine, food, and equipment detail models
- implement search and filtering
- implement image/document upload

### Phase 3: Barcode

- implement barcode lookup flow in backend
- implement barcode input flow in web
- implement backend barcode lookup service
- integrate first external product source
- save scan results into local catalog

### Phase 4: Alerts and Reports

- expiration reminders
- warranty reminders
- dashboard widgets
- report/export views

### Phase 5: Offline and Quality

- QA for barcode flows
- performance tuning
- production deployment preparation

### Phase 6: Mobile App

- build React Native mobile app
- add camera-based barcode scanning
- add mobile reminders and offline support
- prepare app-store release

## 14. MVP Recommendation

The best MVP is:

- `API backend`
- `Web app`

This is the best match for the requested delivery scope because it gives you a usable inventory system earlier, with lower cost and less implementation risk.

Mobile should be planned from the start, but implemented only after the API and web workflows are proven.

## 15. What Should Not Be Done in V1

Avoid these in the first version:

- advanced multi-user collaboration
- complex barcode provider abstraction with many vendors
- AI recognition from item photos
- deep analytics
- complicated permission system
- nested place hierarchy in UI beyond the required two levels

## 16. Final Recommendation

Build a **polyglot monorepo/workspace** with:

- **FastAPI Python API**
- **PostgreSQL + SQLAlchemy + Alembic**
- **React web app with Vite**
- **Expo React Native mobile app later**

This gives the right balance of:

- fast MVP delivery
- useful desktop management
- a backend outside JavaScript
- React alignment between web and future mobile
- reasonable long-term maintainability

## 17. Suggested Next Decision After Review

After approving this plan, the next step should be to define:

1. MVP feature list
2. exact database schema in SQLAlchemy models and Alembic migrations
3. API contract
4. screen map for mobile and web
5. deployment target for backend and storage

## 18. Implementation Status (2026-09-05)

The API and web MVP foundations are implemented. This section records the current codebase rather than future architecture recommendations.

### Delivered: API Foundation

- FastAPI application under `apps/api` with OpenAPI documentation at `/docs`.
- Email/password registration and OAuth2 password-form login issuing a short-lived JWT access
  token (15 minutes) plus a rotating refresh token (7 days).
- Every token carries a session id (`sid`) backed by an `auth_sessions` row, so
  `POST /api/v1/auth/refresh` rotates a session and `POST /api/v1/auth/logout` revokes it.
  A refresh token replayed after its session ended revokes every session for that user, with a
  short grace window for parallel-tab races.
- `SECRET_KEY` must come from the environment when `ENVIRONMENT=production`; the API refuses to
  start on a missing, short, or known development secret. `/docs`, `/redoc`, and the OpenAPI
  schema are served only outside production.
- CORS is an explicit allowlist (`CORS_ORIGINS`), and registration, login, and refresh are
  rate limited per client (in-process sliding window).
- Passwords require at least 8 characters and are capped at the bcrypt 72-byte limit instead of
  being silently truncated. Emails are normalized to lower case, and a login for an unknown
  address spends the same time as a wrong password.
- Per-user ownership checks for sites, places, and inventory items on both read and write paths:
  relocating an item or reparenting a place is validated against the site graph owned by the
  caller, and place hierarchies are checked for cycles.
- Products are scoped per user (`products.user_id`, unique per user and barcode), so one account
  cannot poison or read the catalog of another account.
- SQLite connections enable `PRAGMA foreign_keys=ON`, so declared foreign keys are enforced.
- SQLAlchemy models and Pydantic schemas for users, auth sessions, sites, places, products, inventory items, medicine details, food details, and equipment details.
- CRUD endpoints implemented for:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `GET`, `POST`, `PATCH`, and `DELETE /api/v1/sites`
  - `GET`, `POST`, `PATCH`, and `DELETE /api/v1/places`
  - `GET`, `POST`, `PATCH`, and `DELETE /api/v1/inventory-items`
- `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`.
- `POST /api/v1/barcode/lookup` validates the barcode as 6-14 digits and checks the catalog of
  the caller. With `local_only: true` (web step 1) it stops there. Otherwise it falls back to
  Open Food Facts with a timeout. A lookup no longer writes to the catalog;
  `POST /api/v1/barcode/scan-result/save` stores a result the user confirmed. Creating an
  inventory item with a 6-14 digit barcode also upserts that product for the caller.
- Item invariants are enforced by the API, not only the UI: medicine and food require an expiration date,
  detail blocks must match `item_type`, `quantity` must be finite and non-negative, and
  `photo_url` / `image_url` / `receipt_file_url` must be `http` or `https`.
- Medicine details support an expiration date.
- Food details support a required `expiration_date` and optional `form` (canned, jar, dry, and similar).
- Equipment details support optional `buy_date` and `warranty_expiration_date` values.
- `POST /api/v1/inventory-items/:id/use` subtracts `1` from quantity for `medicine` and `food` only.

### Delivered: Barcode lookup step 1 (local catalog, typed digits)

This is the first barcode slice from section 7: local product catalog only. Camera scanning and
Open Food Facts from the web UI are not in this step.

- Quick add has a digits-only barcode field (6-14 characters for catalog lookup) and a **Look up**
  button. Enter in that field looks up without submitting the form. **Scan lookup** in the sidebar
  and **Add item** focus the barcode field.
- `POST /api/v1/barcode/lookup` accepts `local_only: true`. The web app always sends that flag, so
  a miss does not call Open Food Facts.
- A local hit prefills item name, unit, and item type (`medicine` / `food` / `equipment` / `other`).
- Adding an item with a 6-14 digit barcode writes the code on the inventory row and, if that
  barcode is new for the caller, inserts a user-owned `products` row with:
  - `name` (item display name)
  - `barcode`
  - `default_unit`
  - `category` (copied from `item_type`)
  - `source` = `user`
- Existing catalog rows are left unchanged. Non-catalog barcodes (not 6-14 digits) stay on the
  item only and do not create a product.
- Brand, manufacturer, and image are still unused in this step.

### Delivered: Database and Migrations

- Local development uses SQLite through `aiosqlite` by default.
- Alembic owns the schema: `apps/api/alembic.ini` plus `0001_initial` and `0002_food_item_type`.
  Run `python -m alembic upgrade head` from `apps/api`.
- Tables are still created automatically at startup in development and test. In production
  (`ENVIRONMENT=production`) startup does not touch the schema and Alembic must be run.
- A SQLite file created before a given migration exists on the old schema. Delete it and let the
  migration recreate it, or stamp and hand-migrate it. After `0001`, the schema gained
  `auth_sessions` and `products.user_id`, and `products.barcode` is unique per user. After `0002`,
  `item_type` includes `food` and `food_details` exists.
- PostgreSQL remains the recommended production database; it needs an async driver
  (`asyncpg`) and `DATABASE_URL` pointing at the cluster.

### Delivered: Web MVP

- React, TypeScript, Vite, TanStack Query, and Lucide are implemented under `apps/web`.
- Responsive authenticated workspace: desktop sidebar, phone bottom navigation, and inventory
  tables that stack as cards on small screens. Welcome and sign-in also collapse for mobile.
- Signed-in routes are shareable via the browser path (`/`, `/medicines`, `/foods`, `/locations`,
  `/items`, `/items/new`, `/items/:id`) using `history.pushState` rather than React Router.
- Users can register, sign in, and sign out. Sign-out revokes the session on the API.
- An expired access token is refreshed transparently. When the refresh token is also dead, the
  client clears its tokens and returns to the welcome screen instead of showing a signed-in
  workspace with empty tables.
- API errors are surfaced as text, including the list-shaped validation `detail` from FastAPI.
- `VITE_API_BASE_URL` sets the API origin for a production build served from a different host
  (see `apps/web/.env.example`); it stays unset for the dev proxy and same-origin deployments.
- Users can create, update, and delete sites and places. Places are displayed beneath their site.
- Users can add inventory items as `other`, `medicine`, `food`, or `equipment`.
- Quick add accepts a typed barcode (digits only, 6-14 characters for catalog lookup).
  `Look up` calls `POST /api/v1/barcode/lookup` with `local_only: true` and prefills name,
  unit, and item type from the caller's catalog. Unknown codes stay editable; adding the item
  writes the barcode onto the inventory row and upserts a user-owned `products` row (name,
  barcode, default unit, and category from item type) for the next lookup.
- Medicine and food entry capture expiration date. Food can also store packaging `form`.
- Equipment entry optionally captures buy date and warranty end date; the inventory table displays warranty end dates when present.
- Inventory supports type filtering and text search across item name, barcode, and place, and
  shows item location, quantity, and status.
- The Items page (`/items`, `/items/new`, `/items/:id`) creates, edits, and deletes every field
  on an inventory item. Inventory rows link to that editor.
- Users can remove an inventory item from the table after confirming. Delete calls
  `DELETE /api/v1/inventory-items/:id` and does not remove the catalog product for that barcode.
- Quick add only offers places that belong to the selected site.
- Deleting a site or place names it and states how many places and items go with it.
- English and Ukrainian (`EN` / `UA`) UI locales are available, persist in local storage, and update the document language attribute.
- When the API `ENVIRONMENT` is `development` or `test`, the signed-in sidebar (or the mobile
  **More** sheet) shows a note above the language switcher. Production builds hide it.
  `GET /api/v1/meta` is public and returns that value.
- Locale messages are split by language and screen area under `apps/web/src/i18n/messages` to reduce future merge conflicts.

### Delivered: Medicines and Food tabs

- **Medicines** (`/medicines`) lists every `item_type = medicine` row by default.
- **Food** (`/foods`) lists every `item_type = food` row the same way (pantry / canned goods).
- Location is shown as `site/place` (for example `Home/Kitchen`). A location dropdown filters
  to one of those pairs; **Expired only** keeps rows whose `expiration_date` is before today.
- **Use 1** calls `POST /api/v1/inventory-items/:id/use`, which subtracts `1` from quantity for
  medicine and food and rejects empty packs or other item types. The catalog product is unchanged.
- Each row can be deleted (same confirm + `DELETE` as inventory). **Delete N in this view**
  removes every row currently shown after filters, for example all expired medicines.
- Additional medicine and food use cases to consider next (not built yet):
  - Use a custom amount (half tablet, 5 ml, half a can) instead of a fixed 1
  - Undo the last use
  - Low-stock alerts when quantity falls below a threshold
  - Reminders N days before expiration, and after-opening expiry
  - Move an item to another place without leaving the medicines or food view
  - Track dosage / “take next at” for a household member (medicine)
  - Split the same product into batches with different expiration dates
  - Mark empty packs disposed instead of leaving quantity at 0
  - Photo of the box and a link to the patient leaflet (medicine)

### Delivered: Quality Tooling and Tests

- API tests use `pytest`, `pytest-asyncio`, `httpx`, and an in-memory async SQLite database.
- API test coverage includes authentication, refresh/rotation/logout, rate limiting, secret-key
  configuration, sites, places, place-hierarchy cycles, inventory item creation and relocation,
  item invariants, barcode lookup (including local-only), confirm-then-save, creating an item
  with a catalog barcode (which upserts `products`), using a medicine or food item (quantity minus one),
  foreign-key enforcement, optional equipment dates, and two-user ownership tests (`tests/test_ownership.py`) covering item,
  place, and product isolation.
- Web end-to-end tests use Playwright with Chromium.
- Current browser coverage includes authentication UI, EN/UA switching, notices, site
  add/update/delete, quick-add focus behavior, equipment date payloads, warranty-date display,
  food create/expiry display, inventory search, site-scoped place selection, typed barcode lookup
  against the local catalog, saving a new barcode on item create, inventory item deletion, the
  sidebar environment note, shareable page URLs, the items editor, the medicines tab (location and
  expired filters, use 1), the food tab (use 1), token refresh, expired-session sign-out, and
  API validation messages.
- Python formatting and static analysis use Ruff and Pylint, configured in `apps/api/pyproject.toml`.
- Web formatting and static analysis use Prettier and ESLint.
- `check-style.bat` and `check-style.sh` run the Python and web style checks together.
- After a feature lands, run API tests (`pytest` from `apps/api`), web Playwright tests
  (`npm run test:ui` from `apps/web`), then the matching style script for the OS.

### Delivered: Developer Experience

- `.gitignore` excludes Python environments, SQLite databases, Node modules, build output, test reports, local environment files, logs, and editor artifacts.
- `dev-dev.bat` starts the API and web app on Windows after installing development dependencies.
- `start-dev.sh` provides the equivalent Bash workflow.
- `apps/api/start-dev.bat` starts the API independently on Windows.
- Default local URLs:
  - Web: `http://127.0.0.1:5173`
  - API: `http://127.0.0.1:8000`
  - API docs: `http://127.0.0.1:8000/docs`

### Remaining MVP Work

- Complete product catalog CRUD (separate from inventory item editing, which is done).
- Barcode lookup in the web UI is connected for local catalog prefill (typed digits,
  `local_only`); camera scanning and Open Food Facts from the web app are still later steps.
- Add filters beyond item type and text search.
- Add document/photo upload and object storage integration.
- Add reminder persistence, `scan_history`, warranty views, and dashboard/reporting workflows.
  The medicines and food tabs cover listing, location/expiry filters, and using one unit.
- Provision a production PostgreSQL database and run the Alembic migrations against it.
- Adopt React Router, Tailwind, and a shared `packages/api-contract` as planned in sections 5
  and 8; the web app is still a single `App.tsx` with custom CSS, history-based paths, and
  hand-written types.
- Move auth rate limiting to a shared store (Redis) before running more than one API process:
  the current limiter is per-process.
