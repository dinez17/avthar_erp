# Supplier portal

The supplier portal gives a supplier a login to their own corner of the ERP: the orders
placed with them, their invoices and payments, and one action — acknowledging a purchase
order. It is a separate PWA (`apps/supplier-pwa`) talking to the same API.

## Who a login can see — PortalAccount

Portal access is a **link table**, `PortalAccount`, joining a login (`User`) to a party it
may act for. A table rather than a column on the user, so one login can front more than one
supplier, and access can be granted and revoked without touching the user. The link carries
`partyType` (SUPPLIER / CUSTOMER) and the party id, plus an `isActive` flag.

Every portal request is scoped by this link, not by a permission — an external user holds
none. `PortalAccessService.assertSupplierAccess(userId, supplierId)` runs on every supplier
read and on the acknowledgement, and refuses anything the login is not linked to.

## Provisioning (admin side)

An admin with `portalAccount:manage` grants access from **Portal access** in the admin app:
pick a supplier and a contact email. If a user with that email exists it is linked;
otherwise a new login is created (with the SUPPLIER role) and a **one-time temporary
password** is shown once, to hand to the supplier. Access can be disabled or revoked from
the same page.

## What the supplier sees

- **Overview** — orders awaiting their acknowledgement, open orders, unpaid invoices, and
  the outstanding amount (posted invoices, `grandTotal − paidAmount`).
- **Orders** — every non-draft purchase order placed with them, with a detail view of the
  lines.
- **Invoices** — posted purchase invoices.
- **Payments** — payments made to them.

A login linked to more than one supplier gets a switcher; one with a single supplier just
sees its name.

## Products, stock, and raising an order

The **Products & stock** page lists the products the supplier supplies. A supplier's
catalogue is defined at the **brand** level: on **Brands** (admin) you pick a supplier for
each brand, and every product under that brand is that supplier's. The portal then shows
those products, with two figures each:

- **Current stock** — the company's on-hand quantity across all godowns (summed from stock
  balances).
- **On order (PO)** — boxes still due on the supplier's open purchase orders (DRAFT /
  APPROVED / PARTIALLY_RECEIVED, counting `qtyBoxes − receivedBoxes`). Clicking it drills
  into the individual orders, each with its pending quantity and expected date.

From the same page (or the top action) the supplier can **raise an order**: pick a branch,
add products with boxes and a rate (prefilled from the product's purchase rate), and an
expected date. This goes through the existing purchase desk and creates a real
**PurchaseOrder in DRAFT** — the supplier's id forced on so a login can only ever raise
orders for itself — for staff to review and approve in the admin app. Once raised, its
quantity shows up under the product's **On order** figure.

## The action: acknowledging an order

A supplier can respond to a freshly placed order (status APPROVED, awaiting response):

- **Acknowledge** — "I can supply this."
- **Query** — raise an issue, with a required note.

The response is recorded on the order (`supplierAckStatus` → ACKNOWLEDGED / QUERIED, with
the time and note), kept separate from the internal approval status. Once answered, or once
the order has moved past APPROVED, it can no longer be acknowledged.

## Permissions & scope, at a glance

| Actor | How they are gated |
| --- | --- |
| Admin provisioning | `portalAccount:manage` permission |
| Supplier (portal) | No permission — scoped to their linked supplier(s) by PortalAccount |

## API

Admin: `GET/POST /portal-accounts`, `PATCH /portal-accounts/:id/active`, `DELETE
/portal-accounts/:id`.

Portal (scoped to the caller's links):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/portal/me` | The user and the parties they may act for |
| `GET` | `/portal/supplier/:id/summary` | Dashboard counts and outstanding |
| `GET` | `/portal/supplier/:id/orders` | Purchase orders |
| `GET` | `/portal/supplier/:id/orders/:orderId` | One order with lines |
| `POST` | `/portal/supplier/:id/orders/:orderId/acknowledge` | Acknowledge or query |
| `GET` | `/portal/supplier/:id/invoices` | Posted invoices |
| `GET` | `/portal/supplier/:id/payments` | Payments received |
| `GET` | `/portal/supplier/:id/products` | Products with on-hand + PO stock |
| `GET` | `/portal/supplier/:id/products/:productId/po-stock` | Orders behind a product's PO stock |
| `GET` | `/portal/supplier/:id/branches` | Branches to raise an order against |
| `POST` | `/portal/supplier/:id/orders` | Raise a draft purchase order |

The customer portal (10.2) reuses the same PortalAccount and access model.
