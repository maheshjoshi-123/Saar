# Billing, Tokens, Pricing and Coupons

Saar uses internal credits to protect GPU cost before a user starts a video generation. The goal is simple: estimate the job cost, compare it with the user's wallet balance, block the job when credits are insufficient, and keep a ledger of every grant, coupon, debit and refund.

`user_id` is treated as an external identity key. For production, set `USER_AUTH_ENFORCED=true` and issue each customer a signed user token. This prevents one user from typing another user's ID and viewing jobs, wallet balance, memory, prompt packets, or coupon redemptions.

## Core Flow

```text
user selects task and duration
  -> API estimates required credits
  -> frontend shows balance and cost
  -> API checks wallet when BILLING_ENFORCED=true
  -> credits are reserved when the job is accepted
  -> failed generations are automatically refunded
  -> ledger records every movement
```

## Pricing Plans

Default plans are seeded at startup:

| Plan | Price | Credits | Limit |
|---|---:|---:|---|
| Starter | NPR 999 | 120 | 6-second videos |
| Creator | NPR 2,999 | 450 | 10-second videos |
| Studio | NPR 7,999 | 1,400 | 20-second videos |

Admins can update plans through:

- `GET /api/pricing/plans`
- `POST /api/admin/pricing/plans`

## Credit Estimate

The estimator considers:

- task type
- duration
- quality level
- complexity score
- selected model key

Endpoint:

```http
POST /api/jobs/estimate
```

Example:

```json
{
  "user_id": "demo-user",
  "task_type": "text_to_video_quality",
  "duration_seconds": 6,
  "quality": "standard",
  "complexity_score": 5
}
```

The response includes `required_credits`, `estimated_gpu_seconds`, `user_balance`, and `has_enough_credits`.

## Enforcing Credits

Set this in production when payments or admin credit grants are ready:

```env
BILLING_ENFORCED=true
```

When enabled, `POST /api/jobs` requires `user_id`. If the wallet balance is below `required_credits`, the API returns `402 Insufficient credits`.

When disabled, Saar still calculates and displays job cost, but does not block generation or debit the wallet. This is useful for demos and staging.

## Admin Credit Tools

Admins can grant credits:

```http
POST /api/admin/billing/grant
```

```json
{
  "user_id": "demo-user",
  "amount": 250,
  "reason": "launch credit"
}
```

Admins can create discount/bonus coupons:

```http
POST /api/admin/coupons
```

```json
{
  "code": "SAAR100",
  "credit_amount": 100,
  "percent_bonus": 0,
  "max_redemptions": 100,
  "is_active": true
}
```

Users redeem coupons through:

```http
POST /api/coupons/redeem
```

Coupons can be limited by total redemption count and can only be redeemed once per user.

## User Scope Security

Enable per-user API scope:

```env
USER_AUTH_ENFORCED=true
USER_AUTH_SECRET=long-random-secret
```

Issue a user token from the admin API:

```http
POST /api/admin/users/token
```

```json
{
  "user_id": "customer-123"
}
```

The frontend/API client must send:

```text
X-Saar-User-Id: customer-123
X-Saar-User-Token: <issued-token>
```

Protected user operations include wallets, ledgers, jobs, job events, prompt packets, assurance plans, memory, feedback, revisions, uploads, generation, estimates, and coupon redemption.

The Next.js proxy only injects the backend admin token for `/api/admin/*` when the request includes the configured `SAAR_ADMIN_UI_KEY`. This is a temporary operational guard for the MVP dashboard. For real production, replace it with signed-in admin accounts and role-based authorization.

## Ledger

Every credit movement is stored in `credit_ledger`:

- `grant`
- `coupon`
- `debit`
- `refund`
- `adjustment`

Use:

```http
GET /api/billing/ledger?user_id=demo-user
```

## Production Notes

RunPod pricing and model runtime vary by GPU, workflow, queue delay, video duration and resolution. The included credit table is an operating model, not a guarantee of exact GPU cost.

Before real launch:

- connect payment provider checkout to `add_credits`
- keep `API_AUTH_TOKEN`, `ADMIN_AUTH_TOKEN`, and `SAAR_ADMIN_UI_KEY` separate
- monitor real RunPod cost per workflow
- adjust `BASE_CREDITS` and plan credits from measured margins
- keep `max_concurrency=1` until each workflow is stable
- add user authentication so wallet access is scoped to the signed-in user
