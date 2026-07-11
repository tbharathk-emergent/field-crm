"""Platform-default legal document templates.

Used as a fallback in `/api/public/legal/{kind}` when a tenant has not published
their own version yet. Keeps App Store / Play Store reviewers happy without
forcing every tenant admin to fill in six documents on day one.

Tenant admins can override any of these by publishing a doc from
Admin → Legal Documents. The public endpoint prefers tenant-owned rows.
"""
from __future__ import annotations

from typing import Dict


PLATFORM_LEGAL_TITLES: Dict[str, str] = {
    "privacy": "Privacy Policy",
    "terms": "Terms of Service",
    "refund": "Refund Policy",
    "shipping": "Shipping Policy",
    "about": "About Us",
    "contact": "Contact Us",
}


PLATFORM_LEGAL_MD: Dict[str, str] = {
    "privacy": """# Privacy Policy

_This is a platform default. Your organisation may publish a custom Privacy
Policy that will replace this document._

## What we collect
- Account data: phone number, name, role, and business assignment.
- Operational data: check-in/out timestamps, GPS coordinates during working hours, sales, collections, visits, and enquiries you record.
- Device data: push-notification token, device model, OS version, and app version — used for delivering notifications and diagnosing crashes.

## How we use it
- To provide the field-force management service you signed up for.
- To generate reports for your employer / organisation administrator.
- To send transactional and push notifications tied to your role.

## Sharing
- We do **not** sell your personal data.
- Your data is scoped strictly to your tenant/organisation. Only administrators of your own organisation can view it.
- We share limited data with third-party service providers we rely on (Firebase for notifications, AWS for file storage, Google Maps for geocoding) — each governed by their own privacy policies.

## Your rights
- **Access & Export**: request a copy of your data from your administrator.
- **Correction**: update your profile from the app.
- **Deletion**: request deletion from your administrator. Some data may be retained for legal / audit purposes as required by law.

## Security
- Transport encryption (HTTPS) is enforced end-to-end.
- Passwords / OTPs are never stored in plain text.
- Access is scoped by role and by tenant.

## Contact
If you have questions about this policy, please contact your organisation administrator, or reach out to `support@localappstore.in`.

_Last updated when this platform default was seeded._
""",

    "terms": """# Terms of Service

_This is a platform default. Your organisation may publish custom Terms that
will replace this document._

## Acceptance
By using this app you agree to these terms. If you do not agree, please stop
using the app and contact your administrator.

## Account
- One phone number = one account. You are responsible for the security of your
  phone and OTP.
- You must be authorised by your organisation to use the app.

## Acceptable use
- Do not attempt to access data outside your assigned scope.
- Do not attempt to reverse-engineer, disassemble, or tamper with the app.
- GPS tracking is a requirement of the role your employer has assigned; if you
  cannot comply with that requirement, please contact your administrator.

## Content
- Content you upload (photos, visit notes, sales records) belongs to your
  organisation, not to you personally. Your administrator controls retention
  and deletion.

## Termination
Your access may be revoked by your organisation administrator at any time.
Upon revocation, your data remains with your organisation.

## Warranty & liability
The service is provided **"as is"** without warranties. To the maximum extent
permitted by law, our liability is limited to the fees paid by your
organisation for your seat.

## Governing law
These terms are governed by the laws applicable at the registered address of
your organisation.

## Changes
We may update these terms; continued use after a change constitutes acceptance.

_Last updated when this platform default was seeded._
""",

    "refund": """# Refund Policy

_This is a platform default. Your organisation may publish a custom refund
policy that will replace this document._

The default refund policy for orders placed through this app is:
- Requests for refund must be made within 7 days of delivery.
- Refunds are approved at the discretion of your organisation.
- Physical goods must be returned unused and in original packaging.
- Approved refunds are processed within 7–10 business days via the original
  payment method.

For questions or claims, please contact your organisation administrator or
customer support.
""",

    "shipping": """# Shipping Policy

_This is a platform default. Your organisation may publish a custom shipping
policy that will replace this document._

- Standard delivery timelines depend on your delivery pin-code and are shown
  at checkout.
- Delivery updates are sent via push notification and SMS.
- If a delivery is not received within the promised window, please contact
  support with your order ID.
""",

    "about": """# About Us

_This is a platform default. Your organisation should publish a custom About
page describing its mission, address, and legal registration details._

This application is provided on top of the FieldCRM platform, a multi-tenant
field-force management service by localappstore.in.
""",

    "contact": """# Contact Us

_This is a platform default. Your organisation should publish a custom
Contact page listing its support email, phone number, and physical address._

For any questions about this app, please contact your organisation
administrator. For platform-level issues, reach us at
`support@localappstore.in`.
""",
}


def platform_default(kind: str) -> dict:
    """Return the platform-default legal doc for `kind`, or a stub when unknown."""
    return {
        "kind": kind,
        "title": PLATFORM_LEGAL_TITLES.get(kind, kind.replace("-", " ").title()),
        "content_md": PLATFORM_LEGAL_MD.get(
            kind,
            f"# {kind}\n\nThis document has not been configured for your tenant "
            f"and no platform default exists. Please contact your administrator."
        ),
        "version": 0,
        "published_at": None,
        "is_platform_default": True,
    }
