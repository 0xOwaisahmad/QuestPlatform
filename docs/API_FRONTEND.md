# API Documentation for Frontend Developers

Base URL: `/api/v1`

All protected routes require the JWT in the header:
```
Authorization: Bearer <token>
```

The JWT is scoped to a **wallet + project**. Use the token returned from `POST /auth/verify` for that project.

---

## 1. Auth

### GET `/api/v1/auth/nonce`

Get a nonce for Sign-In with Ethereum (SIWE). Use this nonce when building the message the user signs.

**Auth:** None

**Query parameters:**

| Parameter   | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `address`  | string | Yes      | Wallet address (e.g. `0x...`), 42 chars |
| `projectId`| string | Yes      | Project UUID                         |

**Response (200):**
```json
{
  "status": "success",
  "nonce": "string"
}
```

---

### POST `/api/v1/auth/verify`

Verify SIWE signature and log the user in. Returns a JWT and user fields.

**Auth:** None

**Body (JSON):**

| Field       | Type   | Required | Description                    |
|------------|--------|----------|--------------------------------|
| `message`  | string | Yes      | Full SIWE message user signed |
| `signature`| string | Yes      | Signature from wallet         |
| `projectId`| string | Yes      | Project UUID                  |
| `referral` | string | No       | Referrer wallet address       |

**Response (200):**
```json
{
  "status": "success",
  "token": "string",
  "walletAddress": "string",
  "profileName": "string | null",
  "realName": "string | null",
  "twitterId": "string | null",
  "telegramId": "string | null",
  "discordId": "string | null",
  "facebookId": "string | null",
  "instagramId": "string | null",
  "role": "USER | ADMIN"
}
```

Store `token` and send it as `Authorization: Bearer <token>` on protected routes.

#### SIWE flow: what to sign and verify request

**1. What gets signed (by the wallet / private key)**  
The wallet signs the **full SIWE (EIP-4361) message string** — nothing else. That string is built on the frontend and must include the **nonce from `GET /auth/nonce`**.

**2. Building the message (frontend)**  
Use the `siwe` package (or equivalent). Example with `siwe`:

```ts
import SiweMessage from 'siwe';

// After you have: address, nonce from GET /auth/nonce, and projectId
const siweMessage = new SiweMessage({
  domain: window.location.host,           // e.g. "localhost" or "yourapp.com"
  address: address,                       // wallet address (0x...)
  statement: 'Sign in to the app.',        // optional
  uri: window.location.origin,            // e.g. "https://yourapp.com"
  version: '1',
  chainId: 1,                             // your chain id (e.g. 1 for mainnet)
  nonce: nonce,                           // from GET /auth/nonce — must match
  issuedAt: new Date().toISOString(),
});

const messageToSign = siweMessage.prepareMessage();  // string to sign
```

**3. Signing (frontend)**  
Sign the string `messageToSign` with **EIP-191 personal_sign** (e.g. `eth_sign` / `personal_sign`). The user approves in their wallet; the wallet uses the private key to produce the signature.

- **Input:** the exact `messageToSign` string (no hashing; the wallet handles it).
- **Output:** hex signature string (e.g. `0x...`). That is the `signature` you send to verify.

Example (ethers v6):

```ts
const signature = await signer.signMessage(messageToSign);  // hex string
```

**4. Verify API (Postman / frontend)**  
Send the **same message string** and the **hex signature** in the verify request:

- **Method:** `POST`
- **URL:** `http://52.140.121.204:3000/api/v1/auth/verify` (or your base + `/api/v1/auth/verify`)
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**

```json
{
  "message": "localhost wants you to sign in with your Ethereum account:\n0xC4362caEb588a236295af5e0028146f0813342Af\n\nSign in to the app.\n\nURI: http://localhost\nVersion: 1\nChain ID: 1\nNonce: YOUR_NONCE_FROM_API\nIssued At: 2025-02-23T12:00:00.000Z",
  "signature": "0x...",
  "projectId": "aa02cde2-ba90-4aba-9ba8-ec2d67d1dd9b"
}
```

| Field        | Type   | Description |
|-------------|--------|-------------|
| `message`   | string | **Exact** SIWE message string the user signed (from `prepareMessage()`). |
| `signature` | string | Hex signature from `personal_sign` / `signMessage(messageToSign)`. |
| `projectId` | string | Project UUID. |
| `referral`  | string | Optional. Referrer wallet address. |

Backend checks: message parses as SIWE, nonce in message matches the one stored for that `address` + `projectId`, and `signature` verifies against the message. Then it returns the JWT and user fields.

---

## 2. Points

### GET `/api/v1/points/leaderboard`

Public leaderboard for a project. Paginated.

**Auth:** None

**Query parameters:**

| Parameter   | Type   | Required | Default | Description        |
|------------|--------|----------|---------|--------------------|
| `projectId`| string | Yes      | -       | Project UUID       |
| `page`     | string | No       | `"1"`   | Page number (digits) |
| `limit`    | string | No       | `"20"`  | Page size (digits, max 100) |

**Response (200):**
```json
{
  "status": "success",
  "page": 1,
  "limit": 20,
  "results": 10,
  "data": [
    {
      "rank": 1,
      "walletAddress": "string",
      "profileName": "string | null",
      "totalPoints": 0
    }
  ]
}
```

---

### POST `/api/v1/points/total`

Get total points for the authenticated user in the project (from JWT).

**Auth:** Bearer token required

**Body:** None

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "totalPoints": 0
  }
}
```

- `totalPoints`: `number` (integer)

---

### GET `/api/v1/points/rank`

Get current user’s rank and total points in the project (from JWT).

**Auth:** Bearer token required

**Query/Body:** None

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "rank": 1,
    "totalPoints": 0
  }
}
```

- `rank`: `number` (integer, 1-based)
- `totalPoints`: `number` (integer)

---

## 3. Tasks

### GET `/api/v1/tasks/active`

List active tasks for a project. Public.

**Auth:** None

**Query parameters:**

| Parameter   | Type   | Required | Description  |
|------------|--------|----------|--------------|
| `projectId`| string | Yes      | Project UUID |

**Response (200):**
```json
{
  "status": "success",
  "results": 0,
  "data": [
    {
      "id": "string (uuid)",
      "projectId": "string",
      "type": "string",
      "taskUrl": "string | null",
      "status": true,
      "message": "string",
      "socialMediaName": "string",
      "points": 0,
      "time": 0
    }
  ]
}
```

- `time`: `number` – Unix timestamp (seconds). `0` = no expiry.

---

### POST `/api/v1/tasks/pending`

List tasks the user has **not** completed or submitted (pending for them). Project from JWT.

**Auth:** Bearer token required

**Body:** None

**Response (200):**
```json
{
  "status": "success",
  "results": 0,
  "data": [
    {
      "id": "string (uuid)",
      "projectId": "string",
      "type": "string",
      "taskUrl": "string | null",
      "status": true,
      "message": "string",
      "socialMediaName": "string",
      "points": 0,
      "time": 0
    }
  ]
}
```

---

### GET `/api/v1/tasks/user-status`

Get the current user’s task submissions and their status for the project (from JWT).

**Auth:** Bearer token required

**Query/Body:** None

**Response (200):**
```json
{
  "status": "success",
  "results": 0,
  "data": [
    {
      "id": "string (uuid)",
      "taskId": "string",
      "projectId": "string",
      "walletAddress": "string",
      "status": "VERIFYING | COMPLETED",
      "createdAt": "string (ISO date)",
      "approvedBy": "string | null",
      "approvedAt": "string | null",
      "task": {
        "id": "string",
        "type": "string",
        "message": "string",
        "points": 0
      }
    }
  ]
}
```

---

### POST `/api/v1/tasks/complete`

Submit a task for verification (user claims they completed it).

**Auth:** Bearer token required

**Body (JSON):**

| Field   | Type   | Required | Description  |
|--------|--------|----------|--------------|
| `taskId` | string | Yes    | Task UUID    |

**Response (200):**
```json
{
  "status": "success",
  "message": "Task submitted"
}
```

---

### POST `/api/v1/tasks/create`

Create a new task. **Admin only.**

**Auth:** Bearer token (user must have role `ADMIN`)

**Body (JSON):**

| Field           | Type   | Required | Description                              |
|----------------|--------|----------|------------------------------------------|
| `projectId`    | string | Yes      | Project UUID                             |
| `type`         | string | Yes      | e.g. `"SOCIAL"`, `"ONCHAIN"`, `"REFERRAL"` |
| `taskUrl`      | string | No       | URL or empty string                      |
| `message`      | string | Yes      | Task description/instructions            |
| `socialMediaName` | string | Yes   | e.g. platform name                       |
| `points`       | number | Yes      | Integer, positive                        |
| `time`         | number | Yes      | Unix timestamp (seconds); `0` = no expiry |

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "string (uuid)",
    "projectId": "string",
    "type": "string",
    "taskUrl": "string | null",
    "message": "string",
    "socialMediaName": "string",
    "points": 0,
    "time": 0,
    "status": true
  }
}
```

---

### POST `/api/v1/tasks/verify`

Approve or reject a user task submission. **Admin only.**

**Auth:** Bearer token (user must have role `ADMIN`)

**Body (JSON):**

| Field        | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| `userTaskId`| string | Yes      | UserTask UUID                        |
| `status`    | string | Yes      | `"COMPLETED"` or `"REJECTED"`        |

**Response (200):**
```json
{
  "status": "success",
  "message": "Task approved and points awarded."
}
```
or
```json
{
  "status": "success",
  "message": "Task rejected and removed."
}
```

---

## 4. User

### POST `/api/v1/users/link-social`

Link a social profile to the authenticated user. Each platform can be linked only once.

**Auth:** Bearer token required

**Body (JSON):**

| Field      | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `platform`| string | Yes      | One of: `"twitterId"`, `"telegramId"`, `"discordId"`, `"facebookId"`, `"instagramId"` |
| `username`| string | Yes      | Non-empty username/handle for that platform |

**Response (200):**
```json
{
  "status": "success",
  "message": "twitterId linked successfully."
}
```

---

## Error responses

Errors use a consistent shape:

```json
{
  "status": "fail",
  "message": "Human-readable error message"
}
```

Common HTTP codes:
- `400` – Bad request (validation, invalid nonce, etc.)
- `401` – Not logged in or invalid/expired token
- `403` – Forbidden (e.g. not admin, project inactive)
- `404` – Resource not found

---

## Summary table

| Method | Endpoint                     | Auth   | Key input                          |
|--------|------------------------------|--------|------------------------------------|
| GET    | `/auth/nonce`                | No     | Query: `address`, `projectId`      |
| POST   | `/auth/verify`               | No     | Body: `message`, `signature`, `projectId`, optional `referral` |
| GET    | `/points/leaderboard`        | No     | Query: `projectId`, optional `page`, `limit` |
| POST   | `/points/total`              | Yes    | JWT only                           |
| GET    | `/points/rank`               | Yes    | JWT only                           |
| GET    | `/tasks/active`              | No     | Query: `projectId`                 |
| POST   | `/tasks/pending`             | Yes    | JWT only                           |
| GET    | `/tasks/user-status`        | Yes    | JWT only                           |
| POST   | `/tasks/complete`            | Yes    | Body: `taskId`                     |
| POST   | `/tasks/create`              | Admin  | Body: task fields                  |
| POST   | `/tasks/verify`              | Admin  | Body: `userTaskId`, `status`       |
| POST   | `/users/link-social`         | Yes    | Body: `platform`, `username`       |
