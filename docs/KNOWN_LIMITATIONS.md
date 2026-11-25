# CELESTE — Known Limitations & Scope Boundaries

1. **Shared Reception & Staff PIN:** Reception and all five Stylist views share a single operational salon PIN (`RECEPTION_STAFF_PIN_HASH`) per the approved project design (`docs/03-flows-rules.md`), while individual stylist routes (`/barber/:name`) bind the issued `HttpOnly` cookie to the selected stylist slug.
2. **After-Hours Queue Restriction:** Live walk-in/online queue joining (`/join`) enforces real `Asia/Kolkata` salon operating hours and the 30-minute online cutoff (`SALON_CLOSED` outside hours). For off-hours demonstrations, customers can book future appointments via `/appointments`, or the Owner can adjust operating hours in `/admin`.
3. **Stylist Current-Day Filtering:** `/barber/:name` intentionally displays only active queue entries (`Waiting`, `Called`, `In Chair`) assigned to that stylist for the current `Asia/Kolkata` date, so it shows empty states when no customers are queued for that day.
4. **Scheduled Cleanup Trigger:** End-of-day cleanup runs lazily on queue/dashboard reads after closing time and via `CRON_SECRET`-authenticated scheduled invocations when configured.
5. **Excluded Features (By Design):** Online payment gateways, loyalty/reward points, product inventory, home-service bookings, and customer reviews are intentionally out of scope per `docs/01-brief.md`.
