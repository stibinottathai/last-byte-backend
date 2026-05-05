# Last Byte — Backend API Reference

> **Purpose**: Attach this file to your Flutter project so the AI agent has full context of every backend endpoint, data model, authentication flow, and business rule.

---

## 1. Project Overview

**Last Byte** is a food-waste reduction platform where shops sell unsold food at discounted prices before closing. The backend is a **Node.js + Express** REST API with **MongoDB** (Mongoose ODM) and **Socket.IO** for real-time events.

| Item | Value |
|---|---|
| **Runtime** | Node.js ≥ 18 |
| **Framework** | Express 4.x |
| **Database** | MongoDB (Mongoose 8.x) |
| **Auth** | JWT (access + refresh tokens) |
| **Real-time** | Socket.IO 4.x |
| **Production URL** | `https://last-byte-backend.onrender.com` |
| **Local URL** | `http://localhost:5000` |
| **API Base Path** | `/api` |

---

## 2. Authentication Flow

### 2.1 Token Strategy

- **Access Token**: Short-lived (`30m`), sent in `Authorization: Bearer <token>` header.
- **Refresh Token**: Long-lived (`7d`), stored server-side per user. Used to obtain new access + refresh token pair.
- Passwords are hashed with **bcryptjs** (10 salt rounds).

### 2.2 Auth Header Format

```
Authorization: Bearer <accessToken>
```

### 2.3 Token Refresh

When access token expires (HTTP 401 with message "token expired"), call `POST /api/auth/refresh` with the stored refresh token to get a new pair. Both old tokens become invalid.

---

## 3. Roles & Authorization

| Role | Description |
|---|---|
| `user` | Regular consumer. Can browse listings, place orders, cancel orders. |
| `shopOwner` | Shop owner. Can create/manage listings, manage incoming orders, verify pickup codes. Requires admin approval (`shopApprovalStatus: 'approved'`). |
| `admin` | Platform administrator. Full CRUD on users, shops, listings. Dashboard stats, moderation, platform settings. |

---

## 4. Standard Response Format

### Success

```json
{
  "success": true,
  "message": "Optional message",
  "data": { ... },
  "count": 5,
  "total": 42,
  "page": 1,
  "pages": 3
}
```

### Error

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

### Validation Error (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Please provide a valid email" }
  ]
}
```

---

## 5. Data Models

### 5.1 User

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `name` | String | Required, max 50 chars |
| `email` | String | Required, unique, lowercase |
| `password` | String | Required, min 6 chars, `select: false` (never returned) |
| `phone` | String | Optional |
| `role` | String | `'user'` \| `'shopOwner'` \| `'admin'`, default `'user'` |
| `isActive` | Boolean | Default `true`. `false` = banned/deactivated |
| `banReason` | String | Set when user is banned |
| `shopName` | String | Shop owner only |
| `shopAddress` | String | Shop owner only |
| `shopDescription` | String | Shop owner only |
| `shopApprovalStatus` | String | `'pending'` \| `'approved'` \| `'rejected'`. Shop owner only |
| `shopRejectionReason` | String | Set when shop is rejected |
| `shopLocation` | GeoJSON Point | `{ type: 'Point', coordinates: [longitude, latitude] }` |
| `averagePickupMinutes` | Number | Default `15`, min 0 |
| `refreshToken` | String | `select: false` |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

### 5.2 Listing

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `title` | String | Required, max 100 |
| `description` | String | Max 500 |
| `originalPrice` | Number | Required, min 0 |
| `discountedPrice` | Number | Required, min 0, must be < originalPrice |
| `quantity` | Number | Required, min 0, default 1 |
| `maxQuantityPerUser` | Number | Min 1, default 2 |
| `category` | String | `'bakery'`\|`'meals'`\|`'snacks'`\|`'beverages'`\|`'dairy'`\|`'fruits'`\|`'vegetables'`\|`'other'` |
| `cuisine` | String | `'indian'`\|`'arabic'`\|`'bakery'`\|`'continental'`\|`'chinese'`\|`'italian'`\|`'desserts'`\|`'beverages'`\|`'other'` |
| `dietaryType` | String | `'veg'` \| `'non-veg'`, default `'veg'` |
| `availabilityType` | String | `'ready_now'` \| `'pre_order'`, default `'ready_now'` |
| `readyAt` | Date | When pre-order item will be ready |
| `pickupStartAt` | Date | Pickup window start |
| `pickupEndAt` | Date | Pickup window end |
| `averagePickupMinutes` | Number | Default 15 |
| `shopLocation` | GeoJSON Point | Copied from shop owner at creation |
| `image` | String | URL to image |
| `shopOwner` | ObjectId → User | Required |
| `isAvailable` | Boolean | Default `true` |
| `moderationStatus` | String | `'pending'`\|`'approved'`\|`'rejected'`, default `'approved'` |
| `moderationNote` | String | Admin note |
| `reportCount` | Number | Default 0 |
| `reportReasons` | [String] | Array of report reasons |
| `expiresAt` | Date | TTL — listing auto-deletes after this time |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Virtuals** (included in JSON responses):

| Virtual | Type | Description |
|---|---|---|
| `discountPercentage` | Number | `((original - discounted) / original) * 100` rounded |
| `minutesToExpire` | Number\|null | Minutes until `expiresAt` |
| `isClosingSoon` | Boolean | `true` if ≤ 60 minutes to expire |
| `dealBadge` | String | e.g. `"50% OFF - expires in 30 mins"` |
| `googleMapsUrl` | String\|null | Google Maps link from coordinates |

**Discovery metadata** (added by GET endpoints):

| Field | Type | Description |
|---|---|---|
| `distanceKm` | Number\|null | Distance from user (if lat/lng provided) |
| `pickupTimeMinutes` | Number | Same as `averagePickupMinutes` |
| `pickupWindow` | Object | `{ startAt, endAt }` |

### 5.3 Order

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `user` | ObjectId → User | The customer |
| `shopOwner` | ObjectId → User | The shop |
| `listing` | ObjectId → Listing | The listing ordered |
| `quantity` | Number | Min 1 |
| `unitPrice` | Number | `discountedPrice` at time of order |
| `totalPrice` | Number | `unitPrice * quantity` |
| `platformFeePercent` | Number | Fee % at time of order |
| `platformFeeAmount` | Number | Calculated fee amount |
| `shopPayoutAmount` | Number | `totalPrice - platformFeeAmount` |
| `status` | String | `'pending'`\|`'accepted'`\|`'ready'`\|`'completed'`\|`'cancelled'`\|`'rejected'`\|`'disqualified'` |
| `pickupCode` | String | 6-char alphanumeric, uppercase, unique. Shown to user. |
| `readyAt` | Date | When shop marked order ready |
| `pickupExpiresAt` | Date | 60 min after `readyAt` |
| `pickupCodeVerifiedAt` | Date | When pickup code was verified |
| `completedAt` | Date | When order was completed |
| `disqualifiedAt` | Date | When order was disqualified (expired pickup) |
| `itemSnapshot` | Object | `{ title, category, cuisine, dietaryType, expiresAt }` |
| `shopSnapshot` | Object | `{ shopName, shopAddress }` |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Order Status Flow:**

```
pending → accepted → ready → completed
pending → cancelled (by user)
pending → rejected (by shop)
accepted → cancelled (by user)
accepted → rejected (by shop)
ready → completed (via pickup code verification)
ready → disqualified (auto, after 60 min pickup window expires)
```

### 5.4 PlatformSetting

| Field | Type | Notes |
|---|---|---|
| `key` | String | Always `'default'` (singleton) |
| `platformFeePercent` | Number | 0–100, default `10` |

---

## 6. API Endpoints

### 6.1 Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api` | None | Returns API status |

**Response:** `{ success: true, message: "🍔 Last Byte API is running", version: "1.0.0" }`

---

### 6.2 Auth — `/api/auth`

#### `POST /api/auth/register` — Register new user

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "phone": "9876543210"       // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": { "_id", "name", "email", "phone", "role" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

#### `POST /api/auth/login` — Login

**Body:**
```json
{ "email": "john@example.com", "password": "secret123" }
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "_id", "name", "email", "phone", "role", "shopName", "shopAddress" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

> **Note:** Login returns `shopName` and `shopAddress` for shopOwner users.

#### `GET /api/auth/me` — Get current user profile

**Auth:** Required  
**Response:** `{ success: true, data: { <full user object minus password> } }`

#### `PUT /api/auth/me` — Update profile

**Auth:** Required  
**Updatable fields:** `name`, `phone`  
**Response:** `{ success: true, message: "Profile updated successfully", data: { <user> } }`

#### `POST /api/auth/refresh` — Refresh tokens

**Body:** `{ "refreshToken": "eyJ..." }`  
**Response:** `{ success: true, data: { accessToken, refreshToken } }`

#### `POST /api/auth/logout` — Logout

**Auth:** Required  
**Response:** `{ success: true, message: "Logged out successfully" }`

---

### 6.3 Public Listings — `/api/listings`

#### `GET /api/listings` — Browse available listings

**Auth:** None required

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `page` | int | Page number, default 1 |
| `limit` | int | Items per page, default 20 |
| `category` | string | Filter by category enum |
| `dietaryType` | string | `'veg'` or `'non-veg'` |
| `cuisine` | string | Filter by cuisine enum |
| `availabilityType` | string | `'ready_now'` or `'pre_order'` |
| `readyNow` | `'true'` | Only ready-now items that are currently ready |
| `closingSoon` | `'true'` | Items expiring within `closingSoonMinutes` (default 60) |
| `closingSoonMinutes` | int | Threshold for closing soon filter |
| `search` | string | Search title and description (case-insensitive) |
| `minPrice` | number | Min discounted price |
| `maxPrice` | number | Max discounted price |
| `minDiscount` | number | Min discount percentage |
| `lat` | number | User latitude (for distance calc) |
| `lng` | number | User longitude (for distance calc) |
| `maxDistanceKm` | number | Max distance filter (requires lat/lng) |
| `sort` | string | `'price_asc'`\|`'price_desc'`\|`'expires_soon'`\|`'pickup_time'`\|`'nearby'`\|`'discount'` |

**Response:**
```json
{
  "success": true,
  "count": 5,
  "total": 42,
  "totalBeforeDistanceFilter": 50,
  "page": 1,
  "pages": 3,
  "data": [
    {
      "_id": "...",
      "title": "Chocolate Croissants",
      "description": "...",
      "originalPrice": 240,
      "discountedPrice": 120,
      "quantity": 5,
      "maxQuantityPerUser": 2,
      "category": "bakery",
      "cuisine": "bakery",
      "dietaryType": "veg",
      "availabilityType": "ready_now",
      "averagePickupMinutes": 10,
      "image": null,
      "isAvailable": true,
      "moderationStatus": "approved",
      "expiresAt": "2026-05-06T12:00:00.000Z",
      "shopOwner": {
        "_id": "...",
        "name": "Ravi Kumar",
        "shopName": "Ravi Fresh Bakery",
        "shopAddress": "12 MG Road, Bangalore",
        "shopLocation": { "type": "Point", "coordinates": [77.5946, 12.9716] },
        "averagePickupMinutes": 10,
        "isActive": true,
        "shopApprovalStatus": "approved"
      },
      "discountPercentage": 50,
      "minutesToExpire": 180,
      "isClosingSoon": false,
      "dealBadge": "50% OFF - expires in 180 mins",
      "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=12.9716,77.5946",
      "distanceKm": 2.3,
      "pickupTimeMinutes": 10,
      "pickupWindow": { "startAt": "...", "endAt": "..." }
    }
  ]
}
```

#### `GET /api/listings/:id` — Single listing detail

**Query:** `?lat=12.97&lng=77.59` (optional, for distance)  
**Response:** `{ success: true, data: { <listing with discovery meta> } }`

#### `POST /api/listings/:id/report` — Report a listing

**Auth:** None required  
**Body:** `{ "reason": "Expired food" }` (optional)  
**Response:** `{ success: true, message: "Listing reported", data: { reportCount: 3 } }`

---

### 6.4 Shop Owner — `/api/shop`

> All routes require `Authorization` header + `shopOwner` role.

#### `PUT /api/shop/profile` — Update shop profile

**Body (all optional):**
```json
{
  "name": "...", "phone": "...",
  "shopName": "...", "shopAddress": "...", "shopDescription": "...",
  "shopLatitude": 12.9716, "shopLongitude": 77.5946,
  "averagePickupMinutes": 15
}
```

> Updating `shopLocation` or `averagePickupMinutes` also updates all existing listings.

#### `POST /api/shop/listings` — Create listing

**Body:**
```json
{
  "title": "Chocolate Croissants",
  "description": "Fresh from the oven",
  "originalPrice": 240,
  "discountedPrice": 120,
  "quantity": 5,
  "maxQuantityPerUser": 2,
  "category": "bakery",
  "cuisine": "bakery",
  "dietaryType": "veg",
  "availabilityType": "ready_now",
  "readyAt": "2026-05-06T10:00:00Z",
  "pickupStartAt": "2026-05-06T10:00:00Z",
  "pickupEndAt": "2026-05-06T16:00:00Z",
  "averagePickupMinutes": 10,
  "image": "https://example.com/image.jpg",
  "expiresAt": "2026-05-06T20:00:00Z"
}
```

> **Rule:** `discountedPrice` must be < `originalPrice`. Shop must be approved.

**Response (201):** `{ success: true, message: "Listing created successfully", data: { <listing> } }`

#### `GET /api/shop/listings` — My listings

**Query:** `?page=1&limit=20&isAvailable=true&category=bakery`

#### `GET /api/shop/listings/:id` — Single listing

#### `PUT /api/shop/listings/:id` — Update listing

**Updatable fields:** `title`, `description`, `originalPrice`, `discountedPrice`, `quantity`, `category`, `maxQuantityPerUser`, `cuisine`, `dietaryType`, `availabilityType`, `readyAt`, `pickupStartAt`, `pickupEndAt`, `averagePickupMinutes`, `image`, `isAvailable`, `expiresAt`

#### `DELETE /api/shop/listings/:id` — Delete listing

---

### 6.5 Orders — `/api/orders`

> All routes require `Authorization` header.

#### `POST /api/orders` — Place order (user role)

**Body:**
```json
{ "listingId": "60f7b2c...", "quantity": 2 }
```

**Business Rules:**
- Listing must be available, approved, have enough quantity, not expired
- Per-user booking limit enforced (`maxQuantityPerUser`, default 2)
- Listing quantity atomically decremented
- Platform fee calculated from `PlatformSetting`
- A unique 6-char pickup code is generated

**Response (201):**
```json
{
  "success": true,
  "message": "Order booked successfully",
  "data": {
    "_id": "...",
    "user": "...",
    "shopOwner": "...",
    "listing": "...",
    "quantity": 2,
    "unitPrice": 120,
    "totalPrice": 240,
    "platformFeePercent": 10,
    "platformFeeAmount": 24,
    "shopPayoutAmount": 216,
    "status": "pending",
    "pickupCode": "ABC123",
    "itemSnapshot": { "title": "...", "category": "...", "cuisine": "...", "dietaryType": "...", "expiresAt": "..." },
    "shopSnapshot": { "shopName": "...", "shopAddress": "..." }
  }
}
```

#### `GET /api/orders/my` — My orders (user role)

**Query:** `?page=1&limit=20&status=pending`  
**Populated fields:** `listing` (title, image, expiresAt), `shopOwner` (name, shopName, shopAddress, phone)

#### `PATCH /api/orders/my/:id/cancel` — Cancel order (user role)

Only `pending` or `accepted` orders can be cancelled. Listing quantity is restored.

#### `GET /api/orders/shop` — Shop's incoming orders (shopOwner role)

**Query:** `?page=1&limit=20&status=pending`  
**Note:** `pickupCode` is **excluded** from shop view (only customer sees it).  
**Populated fields:** `user` (name, email, phone), `listing` (title, image, expiresAt)

#### `PATCH /api/orders/shop/:id/status` — Update order status (shopOwner role)

**Body:**
```json
{ "status": "accepted" }
```

Or to complete with pickup code verification:
```json
{ "status": "completed", "pickupCode": "ABC123" }
```

**Valid transitions:**
- `pending` → `accepted`, `rejected`
- `accepted` → `ready`, `rejected`
- `ready` → `completed` (requires matching `pickupCode`)
- Marking `ready` sets `readyAt` and `pickupExpiresAt` (60 min window)

#### `POST /api/orders/shop/verify-pickup` — Verify pickup code (shopOwner role)

**Body:** `{ "pickupCode": "ABC123" }`

Finds a `ready` order matching the code for this shop, verifies it, and marks as `completed`.

---

### 6.6 Admin — `/api/admin`

> All routes require `Authorization` header + `admin` role.

#### User Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/users` | List users. Query: `?role=user&isActive=true&search=john&page=1&limit=20` |
| `GET` | `/api/admin/users/:id` | Get single user |
| `PUT` | `/api/admin/users/:id` | Update user (name, email, phone, role, isActive, shop fields) |
| `PATCH` | `/api/admin/users/:id/ban` | Ban user. Body: `{ "reason": "..." }` |
| `DELETE` | `/api/admin/users/:id` | Delete user (+ their listings if shopOwner) |

#### Shop Owner Management

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/admin/shop-owners` | Create shop owner (auto-approved) |
| `GET` | `/api/admin/shop-owners` | List shop owners. Query: `?isActive=true&shopApprovalStatus=pending&search=ravi` |
| `PUT` | `/api/admin/shop-owners/:id` | Update shop owner |
| `PATCH` | `/api/admin/shop-owners/:id/approval` | Approve/reject shop. Body: `{ "status": "approved" }` or `{ "status": "rejected", "reason": "..." }` |
| `DELETE` | `/api/admin/shop-owners/:id` | Delete shop owner + all their listings |

**Create Shop Owner Body:**
```json
{
  "name": "Ravi", "email": "ravi@shop.com", "password": "shop123",
  "shopName": "Ravi Bakery", "shopAddress": "MG Road",
  "phone": "9876543210", "shopDescription": "Fresh baked goods",
  "shopLatitude": 12.9716, "shopLongitude": 77.5946,
  "averagePickupMinutes": 10
}
```

#### Listing Moderation

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/listings` | List all listings. Query: `?moderationStatus=pending&reported=true` |
| `PATCH` | `/api/admin/listings/:id/moderation` | Approve/reject listing. Body: `{ "status": "approved", "note": "..." }` |

#### Dashboard & Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/stats` | Dashboard stats |
| `GET` | `/api/admin/insights` | Business insights (order breakdown, top areas) |
| `GET` | `/api/admin/settings` | Get platform fee settings |
| `PUT` | `/api/admin/settings` | Update platform fee. Body: `{ "platformFeePercent": 10 }` |

**Stats Response:**
```json
{
  "data": {
    "totalUsers": 50,
    "totalShopOwners": 10,
    "totalListings": 100,
    "activeListings": 80,
    "activeUsers": 55,
    "inactiveUsers": 5,
    "pendingShops": 3,
    "delistedListings": 5,
    "totalOrders": 200,
    "revenue": 50000,
    "platformFees": 5000,
    "shopPayouts": 45000
  }
}
```

---

## 7. Socket.IO Real-Time Events

| Event | Direction | Room | Payload |
|---|---|---|---|
| `join-shop` | Client → Server | — | `shopOwnerId` (string) |
| `new-order` | Server → Client | `shop:<shopOwnerId>` | `{ orderId, itemTitle, quantity, totalPrice, customerName }` |

**Flutter Integration:**
```dart
// Connect to socket
final socket = io('https://last-byte-backend.onrender.com');

// Shop owner joins their room
socket.emit('join-shop', shopOwnerId);

// Listen for new orders
socket.on('new-order', (data) {
  // data = { orderId, itemTitle, quantity, totalPrice, customerName }
});
```

---

## 8. Order Lifecycle & Auto-Cleanup

1. **Listing Expiry**: Listings with `expiresAt` are auto-deleted every 10 seconds.
2. **Order Disqualification**: Orders in `ready` status are auto-disqualified if `pickupExpiresAt` passes (60 min after `readyAt`). Cleanup runs every 5 minutes.
3. **Pickup Code**: 6-character alphanumeric (excludes ambiguous chars like O, 0, 1, I, L). Unique across all orders. Case-insensitive matching.

---

## 9. Error Codes

| HTTP Code | Meaning |
|---|---|
| `400` | Bad request / validation error / business rule violation |
| `401` | Not authenticated / invalid token / token expired |
| `403` | Not authorized for this role / account deactivated |
| `404` | Resource not found |
| `500` | Internal server error |

---

## 10. Test Credentials (Seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@lastbyte.com` | `admin123` |
| Shop Owner | `ravi@lastbyte.com` | `shop123` |
| Shop Owner | `priya@lastbyte.com` | `shop123` |
| User | `user@lastbyte.com` | `user123` |

---

## 11. Enum Reference (Quick Lookup)

### Categories
`bakery`, `meals`, `snacks`, `beverages`, `dairy`, `fruits`, `vegetables`, `other`

### Cuisines
`indian`, `arabic`, `bakery`, `continental`, `chinese`, `italian`, `desserts`, `beverages`, `other`

### Dietary Types
`veg`, `non-veg`

### Availability Types
`ready_now`, `pre_order`

### Order Statuses
`pending`, `accepted`, `ready`, `completed`, `cancelled`, `rejected`, `disqualified`

### Shop Approval Statuses
`pending`, `approved`, `rejected`

### Moderation Statuses
`pending`, `approved`, `rejected`

### Sort Options (Listings)
`price_asc`, `price_desc`, `expires_soon`, `pickup_time`, `nearby`, `discount`

---

## 12. Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/lastbyte` |
| `JWT_SECRET` | Access token signing secret | — |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | — |
| `JWT_EXPIRE` | Access token TTL | `30m` |
| `JWT_REFRESH_EXPIRE` | Refresh token TTL | `7d` |

---

## 13. Flutter Integration Notes

### API Service Pattern
```dart
class ApiService {
  static const String baseUrl = 'https://last-byte-backend.onrender.com/api';
  
  // Store tokens in secure storage
  // Add Authorization header to all protected requests
  // Implement token refresh interceptor (on 401, call /auth/refresh)
  // Handle standard error format: { success: false, error: "..." }
}
```

### Key Integration Points

1. **Auth Flow**: Register/Login → Store both tokens → Use access token in headers → Auto-refresh on 401
2. **Listings Browse**: `GET /api/listings` with filters — pass user's lat/lng for distance sorting
3. **Place Order**: `POST /api/orders` with `listingId` + `quantity` → Show `pickupCode` to user
4. **Order Tracking**: `GET /api/orders/my` — poll or use Socket.IO for real-time
5. **Shop Dashboard**: `GET /api/orders/shop` — manage orders, verify pickup codes
6. **Location**: Always send coordinates as `[longitude, latitude]` (GeoJSON format)
