# InvenTracker Mobile API

The iOS app is a thin client. Firestore and the website backend are authoritative for inventory, orders, health checks, notifications, and operation history.

## Authentication

The app signs in through Firebase Authentication and sends the Firebase ID token as `Authorization: Bearer <token>` on every API request. The server verifies the token, resolves the user's default organization, confirms the member record, checks suspension state, checks granular permissions, and validates store access.

The app stores only its renewable Firebase session in Keychain. It does not store an offline inventory database.

## Version

The initial contract is exposed under `/api/mobile/v1`. Responses use this envelope:

```json
{
  "apiVersion": "2026-07-10",
  "serverTime": "2026-07-10T12:00:00.000Z",
  "data": {}
}
```

Errors include a stable code and a user-safe message:

```json
{
  "apiVersion": "2026-07-10",
  "error": {
    "code": "permission_denied",
    "message": "You do not have permission to perform this action."
  }
}
```

## Routes

| Method | Route | Purpose | Permission |
| --- | --- | --- | --- |
| GET | `/api/mobile/v1/bootstrap` | Session, organization branding, allowed stores, dashboard metrics, inventory, orders, health checks, notifications | Member |
| GET | `/api/mobile/v1/inventory` | Current authoritative store inventory | `inventory.view` |
| POST | `/api/mobile/v1/actions/spot-check` | Atomically update every counted item and create one history record | `inventory.edit` |
| POST | `/api/mobile/v1/actions/restock` | Calculate server-side pulls or commit the completed restock | `inventory.edit` |
| POST | `/api/mobile/v1/actions/waste` | Validate stock, decrement it, and create waste/history records | `inventory.edit` |
| GET | `/api/mobile/v1/orders` | Store order drafts and submitted orders | `orders.view` |
| POST | `/api/mobile/v1/orders/{orderId}/submit` | Validate offered lines and vendor minimum, then submit | `orders.approve` |
| POST | `/api/mobile/v1/notifications/read` | Mark notification records as read | Member |

## Consistency rules

- The app never calculates or persists final stock independently.
- Spot-check lines are committed in one Firestore transaction, so a multi-item count cannot partially save.
- Restock quantities are calculated again by the server at commit time.
- Waste cannot exceed the authoritative quantity in the selected stock area.
- An order cannot submit if it contains a product the vendor does not offer or if it is below the vendor minimum.
- Successful writes are followed by a fresh bootstrap request so the device immediately displays server state.
