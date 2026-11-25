# CELESTE — Workflows & Business Rules

## 1. Purpose

This document defines how the CELESTE Salon Queue Management System operates.

It describes customer journeys, queue management, staff assignment, service handling, waiting-time calculations, and administrative rules.

These rules apply consistently across all seven screens.

---

## 2. User Roles

| User | Main responsibilities |
|---|---|
| Customer | View salon information, select services, join the queue, track queue status, cancel an eligible entry |
| Reception | Manage the queue, add walk-ins, call customers, correct entries, mark no-shows and cancellations |
| Staff | View assigned customers, start and complete services, manage availability and breaks |
| Owner | Manage services, prices, staff, operating settings, online queue capacity and daily statistics |

### Access rules

- Owner Settings (`/admin` and `/api/admin/*`) must be protected by Supabase Auth using Email + Password, with a trusted server-assigned `app_metadata.role = 'owner'` verified by the Express backend.
- Reception (`/reception`) and Staff (`/barber/:name`) dashboards and backend endpoints returning customer personal information must be protected by a shared Reception/Staff PIN verified on the backend (stored as a secure hash, never plaintext, and kept separate from Owner authentication). Note that the shared PIN protects access without uniquely identifying individual staff members.
- Customers can access customer-facing screens (`/`, `/join`, `/status/:id`) and the public display (`/display`). Customers track their ticket on `/status/:id` using their unguessable UUID ticket link without phone-number verification; the endpoint exposes only that ticket's permitted status information and never exposes phone numbers.
- Administrative actions must not be available through customer-facing screens.

---

## 3. Salon Operating Rules

### Operating hours

| Day | Opening | Closing |
|---|---|---|
| Monday–Friday | 10:00 AM | 9:00 PM |
| Saturday | 9:00 AM | 10:00 PM |
| Sunday | 10:00 AM | 8:00 PM |

Rules:

1. Salon open/closed status updates automatically according to operating hours.
2. The owner can manually open or close online queue registration.
3. Online queue registration closes 30 minutes before the salon's closing time.
4. Walk-ins can be accepted until closing time.
5. The owner can change online queue availability independently of the salon's open/closed status.

### Daily online capacity

- Default online registration limit: 30 customers per day.
- The owner can adjust this limit.
- When the limit is reached, new online registrations are blocked with a clear message.
- Walk-ins can still be added by reception.
- Cancelled online registrations free up an online registration slot.
- Completed and no-show registrations count towards the day's online registration limit.

---

## 4. Service Catalogue

CELESTE offers four service categories.

Every service has:
- English name
- Gujarati name
- Estimated duration
- Price in INR
- Active/inactive status

### Hair

| Service | Duration | Price |
|---|---:|---:|
| Haircut | 30 min | ₹250 |
| Hair Trim | 20 min | ₹180 |
| Hair Wash | 15 min | ₹120 |
| Blow Dry | 30 min | ₹250 |
| Hair Styling | 40 min | ₹350 |
| Hair Spa | 45 min | ₹650 |
| Deep Conditioning | 30 min | ₹450 |
| Hair Colour | 90 min | ₹1,500 |
| Root Touch-up | 60 min | ₹900 |
| Highlights | 120 min | ₹2,500 |
| Keratin Treatment | 150 min | ₹3,000 |
| Smoothening | 180 min | ₹3,500 |

### Beard & Grooming

| Service | Duration | Price |
|---|---:|---:|
| Beard Trim | 15 min | ₹120 |
| Beard Styling | 25 min | ₹200 |
| Clean Shave | 20 min | ₹150 |
| Hairline & Neck Cleanup | 10 min | ₹80 |
| Head Shave | 30 min | ₹250 |
| Grooming Package | 45 min | ₹450 |

### Skin

| Service | Duration | Price |
|---|---:|---:|
| Basic Clean-up | 30 min | ₹450 |
| Classic Facial | 45 min | ₹700 |
| Premium Facial | 60 min | ₹1,200 |
| De-tan Treatment | 30 min | ₹500 |
| Face Bleach | 20 min | ₹300 |
| Eyebrow Threading | 10 min | ₹80 |
| Upper Lip Threading | 5 min | ₹50 |
| Face Waxing | 20 min | ₹250 |

### Hands & Feet

| Service | Duration | Price |
|---|---:|---:|
| Basic Manicure | 30 min | ₹350 |
| Spa Manicure | 45 min | ₹600 |
| Basic Pedicure | 40 min | ₹450 |
| Spa Pedicure | 60 min | ₹800 |
| Nail Polish | 15 min | ₹150 |
| Gel Polish | 30 min | ₹450 |
| Nail Art | 30 min | ₹500 |

All prices and durations are sample project values. The owner can edit them.

### Service management rules

- Customers can select a maximum of three services per queue entry.
- Only active services are available for customer selection.
- Inactive services remain in the database but cannot be selected for new registrations.
- Each selected service contributes its duration and price to the booking summary.
- The total estimated duration is the sum of all selected service durations.
- The total estimated price is the sum of all selected service prices.

---

## 5. Staff Management

### Staff members

| Name | Primary role |
|---|---|
| Aarav | Senior Hair Stylist |
| Meera | Hair & Colour Specialist |
| Kabir | Barber & Grooming Specialist |
| Riya | Skin & Beauty Specialist |
| Ananya | Nail & Beauty Specialist |

### Cross-training principle

CELESTE follows a broad cross-training approach.

All five staff members can perform most services across different categories, rather than being restricted to their primary speciality.

Rules:

1. Every staff member has a list of services they are qualified to perform.
2. Common services should generally be available through all five staff members.
3. Intermediate services should be available through several staff members.
4. Only a small number of advanced or specialised services should be restricted to one or two specialists.
5. A customer's complete selection must be handled by one staff member who is qualified for every selected service.
6. The owner can manage staff-service eligibility.
7. Staff must never be assigned a service they are not qualified to perform.

### Proposed staff-service eligibility matrix

This is the revised cross-trained arrangement for the initial demo setup.

A checkmark means the staff member is qualified to perform that service.

| Service | Aarav | Meera | Kabir | Riya | Ananya |
|---|:---:|:---:|:---:|:---:|:---:|
| **Hair** | | | | | |
| Haircut | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hair Trim | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hair Wash | ✓ | ✓ | ✓ | ✓ | ✓ |
| Blow Dry | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hair Styling | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hair Spa | ✓ | ✓ | ✓ | ✓ | ✓ |
| Deep Conditioning | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hair Colour | ✓ | ✓ | ✓ | | |
| Root Touch-up | ✓ | ✓ | | | |
| Highlights | ✓ | ✓ | | | |
| Keratin Treatment | ✓ | ✓ | | | |
| Smoothening | ✓ | ✓ | | | |
| **Beard & Grooming** | | | | | |
| Beard Trim | ✓ | ✓ | ✓ | ✓ | ✓ |
| Beard Styling | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clean Shave | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hairline & Neck Cleanup | ✓ | ✓ | ✓ | ✓ | ✓ |
| Head Shave | ✓ | ✓ | ✓ | ✓ | ✓ |
| Grooming Package | ✓ | ✓ | ✓ | | |
| **Skin** | | | | | |
| Basic Clean-up | ✓ | ✓ | ✓ | ✓ | ✓ |
| Classic Facial | ✓ | ✓ | ✓ | ✓ | ✓ |
| Premium Facial | | | | ✓ | ✓ |
| De-tan Treatment | ✓ | ✓ | ✓ | ✓ | ✓ |
| Face Bleach | ✓ | ✓ | ✓ | ✓ | ✓ |
| Eyebrow Threading | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upper Lip Threading | ✓ | ✓ | ✓ | ✓ | ✓ |
| Face Waxing | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Hands & Feet** | | | | | |
| Basic Manicure | ✓ | ✓ | ✓ | ✓ | ✓ |
| Spa Manicure | ✓ | ✓ | ✓ | ✓ | ✓ |
| Basic Pedicure | ✓ | ✓ | ✓ | ✓ | ✓ |
| Spa Pedicure | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nail Polish | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gel Polish | | | | ✓ | ✓ |
| Nail Art | | | | ✓ | ✓ |

The matrix is an initial sample configuration. The owner should be able to change qualifications through Settings. It must always ensure that every active service has at least one qualified staff member.

The staff members' primary roles remain useful for displaying their expertise, but do not prevent them from handling other services they are qualified for.

### Staff availability

Each staff member has one of these statuses:

- Available
- Busy
- On Break

Rules:

1. A staff member can serve only one customer at a time.
2. Busy staff cannot start another service until the current service is completed.
3. Staff on break cannot receive new assignments.
4. Staff cannot start a break while currently serving a customer.
5. Once a customer is assigned to a staff member (whether via specific selection or immediate assignment for Any Available Stylist), that assignment remains unchanged if the staff member subsequently goes on break. Customers are never silently reassigned.
6. Staff can return from break and become Available if they are on duty and not serving a customer.
7. Reception and Owner can manage staff availability when appropriate.

---

## 6. Staff Assignment Rules

### General principle

One customer must have one staff member for all selected services.

The assigned staff member must be qualified to perform every service selected by the customer.

### Specific staff selection

- Customers can choose a particular staff member.
- Only staff qualified for all selected services should appear as eligible choices.
- If a specifically selected staff member is On Break or off duty, queue confirmation for that stylist must be blocked, explaining why and allowing the customer to choose another eligible stylist or Any Available Stylist.
- The system must never silently replace the customer's selected staff member.

### Any Available Stylist

When the customer selects Any Available Stylist, an eligible staff member is assigned immediately when the customer joins the queue:

1. Find staff members qualified for every selected service.
2. Exclude staff who are off duty or on break.
3. Compare the workload of the remaining eligible staff (including Busy staff).
4. Immediately assign the customer to the eligible staff member with the lightest workload.
5. If workloads are tied, select the staff member who has been available longest.
6. Keep the assignment unchanged if that staff member subsequently goes on break; never silently reassign the customer.
7. If no eligible staff member can be selected, show an appropriate message.

A Busy staff member can still have future customers assigned to their queue. Busy means they are currently occupied, not that they cannot serve another customer later.

### Workload comparison

Workload includes:
- Remaining time for the current customer.
- Estimated service durations of customers already waiting for that staff member.

The system should use this information to distribute customers fairly.

### Multiple services

For example, a customer selects:

- Haircut — 30 minutes
- Beard Trim — 15 minutes
- Hair Wash — 15 minutes

Total estimated duration: 60 minutes.

Rules:

- One eligible staff member must be able to perform all three services.
- Services are performed sequentially.
- The same staff member handles the customer throughout the visit.
- The staff member marks the overall service as Done after all selected services are completed.

---

## 7. Queue Management

### Token generation

Token format:

`S-01`, `S-02`, `S-03`, and so on.

Rules:

1. Tokens are generated sequentially each day.
2. The first token of a new day is S-01.
3. Each token is unique within that day.
4. Cancelled and No-show tokens are never reused.
5. Token generation applies to both online and walk-in customers.

### First Come, First Served (FCFS)

- Customers join the queue in registration order.
- Walk-ins are added at the end of the queue.
- Existing customers cannot be arbitrarily skipped.
- Staff members can serve customers in parallel.
- Each staff member follows the order of customers assigned to them.
- A staff member serves customers assigned to them in FCFS order and does not serve customers assigned to a different staff member.
- Specific staff preferences must always be respected.

### Calling the next customer

When reception selects Call Next for a staff member:

1. Check that the staff member is Available.
2. Find the earliest Waiting customer assigned to that staff member.
3. Confirm that the staff member is qualified for all selected services.
4. Change the customer's status to Called.
5. Record the call time.
6. Start the 10-minute arrival countdown.
7. Update the customer's status page, Reception Dashboard, and Waiting Area TV.

If no eligible customer is waiting, display an appropriate message.

### Queue status lifecycle

The normal service lifecycle is:

`Waiting → Called → In Chair → Done`

Other possible outcomes:

- `Waiting → Cancelled`
- `Called → No-show`

Rules:

- A customer cannot move backwards through the normal service lifecycle.
- A customer cannot be marked Done before entering In Chair.
- A customer who has been marked No-show cannot resume the same queue entry.
- Cancelled and No-show entries remain in historical records.

### Start Coming acknowledgement

When a waiting customer reaches position 2 in their assigned staff member's queue:

1. The My Status screen displays a prominent **Start Coming** button.
2. When clicked, the system records the acknowledgement on the queue entry.
3. The Reception Dashboard displays **Customer on the way** for that entry.
4. Clicking **Start Coming** does not change the customer's queue position or FCFS priority.
5. Clicking **Start Coming** does not automatically mark the customer as arrived.

### Cancellation

Customer cancellation:

- Customers can cancel while their status is Waiting.
- A confirmation prompt must appear before cancellation.
- Customers cannot cancel directly through the customer page once their status is Called or In Chair.
- They must contact reception instead.

Reception cancellation:

- Reception can cancel a queue entry when necessary.
- The cancellation should be reflected on all screens.
- Cancelled tokens are not reused.

### No-show

1. A customer can only be marked No-show after being Called (Waiting customers must not have a No-show action).
2. The 10-minute countdown begins when reception calls the customer.
3. The customer has 10 minutes to arrive.
4. If the customer arrives within the allowed time, the staff member can start the service.
5. Reception can mark the entry No-show only after the 10-minute window expires.
6. If the customer returns later, they must join the queue again and receive a new token.

### Walk-in registration

Reception can add a walk-in customer by entering:

- Customer name
- Phone number
- Required services
- Preferred staff member (optional)

Rules:

- Walk-ins follow the same service eligibility and staff assignment rules as online customers.
- Walk-ins join at the end of the queue.
- Walk-ins receive tokens from the same daily sequence.
- The one-active-entry-per-phone rule applies to walk-ins too.

### Duplicate registrations

- A customer can have only one active queue entry per phone number.
- An active entry includes Waiting, Called, or In Chair.
- The system must prevent a second active entry using the same phone number.
- A new entry can be created after the previous entry becomes Done, Cancelled, or No-show.

---

## 8. Waiting-Time Calculation

Waiting-time estimates are approximate and must not be presented as guaranteed service times.

### Factors considered

- Service durations of customers ahead in the queue.
- Current staff workload.
- Staff service eligibility.
- Staff availability and breaks.
- Changes in queue order or service completion.

### Calculation approach

For a customer assigned to a particular staff member:

1. Calculate the remaining estimated time of the staff member's current service, if any.
2. Add the estimated durations of customers ahead of the customer in that staff member's queue.
3. Use the result as the customer's approximate waiting time.

While previewing *Any Available Stylist* before confirmation on the Join Queue screen, use the projected workload of eligible on-duty staff (not on break) to estimate waiting time and determine the immediate assignment upon joining.

### Updates

Recalculate estimates when:

- A customer joins or leaves the queue.
- Reception changes a queue entry.
- A customer is called.
- A service starts or finishes.
- A staff member goes on break or returns.
- Staff availability changes.

### Display rules

- Show the estimated waiting time on My Status and Reception.
- Display a clear approximate-time label.
- Highlight customers waiting more than 60 minutes in amber on the Reception Dashboard.

---

## 9. Service Timer

Each service has a default estimated duration.

Rules:

1. The timer starts when the staff member selects Start Service.
2. The customer status changes to In Chair.
3. The Staff View timer displays total service duration, elapsed service time, and estimated remaining service time.
4. The timer is associated with the assigned customer.
5. The staff member can select Mark Done after completing the selected services.
6. The customer status changes to Done.
7. The staff member becomes Available if they are on duty and not on break.
8. Queue estimates are recalculated after completion.

The estimated duration is a planning value. Staff members can finish earlier or later.

---

## 10. Language Support

CELESTE supports:

- English (default)
- Gujarati

Rules:

1. A visible language switch must be available across all seven screens.
2. The selected language should remain consistent while navigating the application.
3. Service names, labels, buttons, messages, validation errors, queue statuses, and notifications must be translated.
4. Gujarati text must render correctly using an appropriate Unicode-compatible font.
5. Switching languages must not reset queue data or user selections.

---

## 11. Live Synchronisation

All screens must use the same current queue and staff information.

Changes should appear automatically without requiring manual page refreshes.

Examples:

- A new registration appears on Reception.
- A cancellation updates the queue and waiting estimates.
- A staff availability change updates staff selection and Reception.
- Calling a customer updates My Status and the TV display.
- Starting a service updates the customer's status and staff view.
- Completing a service updates the queue and makes the staff member available.

### Connection handling

- Show a visible warning if the application loses its connection.
- Do not display stale information as though it were current.
- Resume synchronisation when the connection returns.
- Important actions should not be silently lost when the connection is interrupted.

---

## 12. Daily Reset and Historical Records

All operating dates and closing times follow India Standard Time (`Asia/Kolkata`).

### End-of-day cleanup

- At the end of each closed business day, an automatic idempotent cleanup marks any remaining entries still in `Waiting` or `Called` status as `Cancelled`, recording the actor as `system`.
- Entries already in `In Chair`, `Done`, `No-show`, or `Cancelled` status are never modified by end-of-day cleanup.
- End-of-day cleanup never changes any staff member's `Available`, `Busy`, or `On Break` status as a side effect.
- Previous queue records and `queue_status_history` entries remain stored.
- Previous day's unfinished entries are never carried forward into the next day's queue.

### Start of a new operating day

- The token sequence resets to `S-01`.
- A fresh daily queue begins.
- Daily statistics start for the new day.
- Staff availability is initialized atomically and idempotently once per IST business day (tracked via `last_staff_init_date`) according to `is_on_duty` settings, without resetting intentional `On Break` or other availability changes made later that same day.

Historical records remain available to the owner for daily statistics.

---

## 13. Owner Settings

The owner can:

- Add, edit, activate, or deactivate services.
- Change service names, prices, and estimated durations.
- Manage staff profiles.
- Manage staff service eligibility.
- Manage staff on-duty and availability settings.
- Open or close online queue registration manually.
- Change the daily online registration capacity.
- View daily statistics.
- Reset demo data when required.

Changes to service prices or durations should affect new registrations. Existing queue entries should retain the service details and prices recorded when they were created, unless reception explicitly corrects an entry.

---

## 14. Demo Data

On first launch, CELESTE should contain realistic sample data:

- Five staff profiles.
- All 33 services.
- The revised cross-trained staff eligibility matrix.
- Sample customer records.
- Sample queue entries.
- Different staff availability states.

The owner should have an option to reset the demo data.

Resetting demo data must be clearly confirmed before execution and must:

- Delete only today's queue entries (and unreferenced demo customers) explicitly marked `is_demo = TRUE`.
- Preserve all genuine customer entries, including those created today.
- Preserve all historical queue and customer records from previous days.
- Never modify master services, staff profiles, staff-service qualifications, or salon settings (initial master data is seeded separately in `004_seed_initial_data.sql`).

---

## 15. Important Validation and Edge Cases

| Situation | Expected behaviour |
|---|---|
| Customer submits an empty name | Show validation error |
| Invalid phone number | Show validation error |
| Duplicate active phone number | Prevent another active entry |
| No service selected | Prevent queue confirmation |
| More than three services selected | Prevent additional selection |
| No staff member qualifies for all services | Explain that no eligible stylist is available |
| Specific stylist is on break or off duty | Block confirmation, explain why, and allow another eligible stylist or Any Available Stylist |
| Online queue is closed | Prevent online registration |
| Online capacity is full | Show registration-full message |
| Salon is closed | Show salon closed status |
| Customer cancels | Update queue and retain the cancelled record |
| Customer misses the 10-minute window | Allow reception to mark No-show |
| Staff member is Busy | Do not allow another service to start |
| Staff member tries to take a break during a service | Prevent the action |
| Internet connection is lost | Display connection warning |
| Gujarati is selected | Display translated content correctly |

---

## 16. Acceptance Testing Checklist

Before considering the system complete, test the following.

### Customer

- [ ] Customer can view salon information and operating status.
- [ ] Customer can switch between English and Gujarati.
- [ ] Customer can select up to three services.
- [ ] Customer can select a specific eligible staff member.
- [ ] Customer can select Any Available Stylist.
- [ ] Customer receives a unique token.
- [ ] Customer can view queue position and estimated waiting time on `/status/:id` via their UUID ticket link without phone verification, and without exposing phone numbers.
- [ ] Customer at position 2 in their assigned queue can click Start Coming, recording the acknowledgement without changing queue position.
- [ ] Customer can cancel while Waiting.
- [ ] Customer cannot cancel directly after being Called.

### Staff assignment

- [ ] All 33 services have at least one qualified staff member.
- [ ] Common services have broad staff availability.
- [ ] Only selected advanced services are restricted to specialists.
- [ ] Staff are eligible for all services in a customer's selection.
- [ ] One customer is assigned to only one staff member.
- [ ] Specific stylist selection blocks confirmation when the chosen stylist is On Break or off duty without silent reassignment.
- [ ] Customers (whether specific stylist or Any Available Stylist) are assigned immediately at join time and are never silently reassigned if staff subsequently go on break.
- [ ] Any Available assignments immediately select the eligible on-duty staff member (not on break) with the lightest workload (tie-broken by longest availability).
- [ ] Staff on break do not receive new assignments.
- [ ] Multiple staff members can serve different customers simultaneously.

### Reception

- [ ] Reception dashboard and customer-PII endpoints require shared Reception PIN verification.
- [ ] Reception can view the complete waiting queue and `Customer on the way` status after Start Coming is clicked.
- [ ] Reception can add walk-in customers.
- [ ] Walk-ins receive sequential tokens.
- [ ] Reception can call the next eligible customer.
- [ ] The 10-minute countdown works.
- [ ] Waiting customers do not have a No-show action; Reception can mark No-show only for Called customers after the 10-minute window expires.
- [ ] Reception can cancel or correct an entry.
- [ ] Waiting times update after queue changes.

### Staff view

- [ ] Staff dashboard requires shared Staff PIN verification and returns only that staff member's assigned customer names (never phone numbers).
- [ ] Staff can view their current customer.
- [ ] Staff can start a service.
- [ ] The service timer starts correctly and shows total service duration, elapsed time, and estimated remaining time.
- [ ] Staff can mark the service Done.
- [ ] Staff availability updates after completion.
- [ ] Staff cannot take a break while serving a customer.

### Waiting Area TV

- [ ] Current called tokens appear correctly.
- [ ] The next five tokens and estimates are displayed.
- [ ] Called tokens receive the required visual highlight.
- [ ] Queue updates appear automatically.

### Owner

- [ ] Owner Supabase Auth login (Email + Password, `app_metadata.role = 'owner'`) protects `/admin` and `/api/admin/*`.
- [ ] Owner can edit service information.
- [ ] Owner can manage staff and service eligibility.
- [ ] Owner can manage online queue availability.
- [ ] Owner can change online capacity.
- [ ] Owner can view daily statistics.
- [ ] Owner can reset demo data with confirmation without deleting genuine customer entries or historical records.

### Data and synchronisation

- [ ] Queue data survives a page refresh.
- [ ] Data remains available after application restart.
- [ ] All screens display consistent queue information.
- [ ] End-of-day cleanup marks leftover `Waiting`/`Called` entries as `Cancelled` (`system`) without altering `In Chair` entries or staff availability.
- [ ] New-day staff initialization runs atomically once per IST business day without overwriting intentional same-day changes.
- [ ] Historical records are retained after daily reset.
- [ ] Connection loss is communicated clearly.
- [ ] Reconnection restores live updates.

---

## 17. Implementation Principles

1. Treat this document and the approved project brief and screen specifications as the source of truth.
2. Do not remove mandatory screens or features.
3. Do not silently simplify or change business rules.
4. Keep customer, reception, staff, and owner views consistent.
5. Validate important actions before saving them.
6. Preserve queue history and token uniqueness.
7. Keep the interface consistent with the approved CELESTE visual identity.
8. Implement in small, testable phases.
9. Update documentation if an approved requirement changes.
10. Test each feature before moving to the next implementation phase.