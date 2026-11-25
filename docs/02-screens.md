# CELESTE — Screen Specifications

**Project:** Salon Queue Management System  
**Document:** Screen Specifications  
**Status:** Draft for Review  
**Related Document:** `docs/01-brief.md`

---

# 1. General UI Requirements

All seven screens must follow the CELESTE visual identity and use a consistent design system.

## 1.1 Brand Styling

- Main background: Warm Ivory `#F8F7F3`
- Primary brand colour: Celeste Sage `#526B5D`
- Primary text: Deep Charcoal Green `#303B39`
- Secondary accent: Dusty Blue `#718A9B`
- Cards: Pure White `#FFFFFF`
- Soft backgrounds: Soft Sage `#E7EEE8`
- Luxury accent: Champagne Beige `#D9C8AE`

Use the approved CELESTE dashboard mockup as the visual reference.

## 1.2 General Navigation

- Customer-facing pages should have clear navigation and a visible language switch.
- Reception, staff and owner views should have role-appropriate navigation.
- All screens must support English and Gujarati.
- Use consistent buttons, typography, cards, badges, icons and spacing.
- Provide clear loading, empty, success and error states.
- All interactive controls must perform their intended actions.

## 1.3 Responsive Behaviour

| Device | Expected Behaviour |
|---|---|
| Mobile | Single-column layouts, touch-friendly controls and compact navigation |
| Tablet | Wider cards, multi-column layouts and dashboard-friendly views |
| Desktop | Full dashboard layouts with appropriate side navigation |
| TV Display | Full-screen, readable queue information with large text |

---

# 2. Screen 1 — Home

**Route:** `/`  
**Primary User:** Customer  
**Purpose:** Introduce CELESTE and allow customers to check salon availability and join the queue.

## 2.1 Layout — Top to Bottom

### A. Header
- CELESTE logo and salon name.
- Navigation links.
- English/Gujarati language switch.
- Clear visual branding.

### B. Salon Information
- Salon name and short welcome message.
- Open/Closed status badge.
- Opening and closing time information.
- Current number of customers in the queue.
- Approximate current waiting time.

### C. Staff Availability
Display staff members as individual cards or status chips.

Each staff member should show:
- Name.
- Profile photograph or avatar.
- Speciality.
- Current availability: Available, Busy or On Break.

### D. Join Queue Section
- Prominent Join Queue button.
- Short explanation of the queue process.
- Indication of whether online joining is currently available.

### E. Footer
- Salon name.
- Address/contact placeholder.
- Operating hours.
- Language option if needed.

## 2.2 Interactions

| Element | Action |
|---|---|
| CELESTE logo | Navigate to Home |
| Language switch | Change interface language |
| Join Queue | Navigate to `/join` |
| Staff card | Show staff information if supported |
| Open/Closed badge | Display current salon status |

## 2.3 States

- Salon Open: Show open badge and allow queue joining if online joining is enabled.
- Salon Closed: Show closed badge and disable online queue joining.
- Online Queue Closed: Explain that online joining is unavailable.
- No Waiting Customers: Display a friendly empty-queue message.
- No Available Staff: Clearly indicate that no staff are currently available.

## 2.4 Responsive Behaviour

- Mobile: Stacked information and horizontally scrollable staff cards if necessary.
- Tablet/Desktop: More spacious layout with staff cards displayed in rows.
- Ensure Join Queue remains easy to find.

---

# 3. Screen 2 — Join Queue

**Route:** `/join`  
**Primary User:** Customer  
**Purpose:** Collect customer details, services and staff preference before creating a queue entry.

## 3.1 Layout — Top to Bottom

### A. Page Header
- Heading: Join the CELESTE Queue.
- Short instructions.
- Language switch.

### B. Customer Information Form

Fields:
1. Customer Name.
2. Phone Number.

Validation:
- Both fields are required.
- Phone number must contain exactly 10 digits.
- Only valid phone number input should be accepted.
- A phone number cannot have more than one active queue entry.
- Display clear validation messages.

### C. Service Selection

Display the four service categories:

1. Hair
2. Beard & Grooming
3. Skin
4. Hands & Feet

Each service should appear as a selectable card containing:
- Service name.
- Service duration.
- Service price.
- Selection indicator.

Rules:
- Customers can select a maximum of three services.
- Customers can select multiple services from different categories.
- Each selected service contributes to the total price and duration.
- Disabled services must not be selectable.
- The interface should clearly show how many services have been selected.

### D. Staff Selection

Display:
- Any Available Stylist.
- Individual staff members with names, specialities and availability.

Rules:
- A customer can choose one specific staff member or Any Available Stylist.
- The selected staff member must be qualified to perform every selected service.
- If a particular staff member cannot perform all selected services, that person must not be selectable.
- Staff who are on break or unavailable must be clearly identified.
- If no eligible staff member is available, explain the situation.

### E. Booking Summary

Display a live summary containing:
- Selected services.
- Total service duration.
- Total price.
- Selected staff member or Any Available Stylist.
- Estimated waiting time.

The summary should update whenever the customer changes a selection.

### F. Confirm Button

- Prominent Confirm & Join Queue button.
- Prevent submission when required fields are invalid.
- Prevent submission when no service is selected.
- Prevent submission when the selected staff preference is invalid.

## 3.2 Interactions

| Element | Action |
|---|---|
| Name input | Enter customer name |
| Phone input | Enter and validate phone number |
| Service card | Select/deselect a service |
| Staff card | Select preferred staff member |
| Any Available Stylist | Select automatic immediate staff assignment |
| Booking summary | Update automatically |
| Confirm button | Validate details and create queue entry |

## 3.3 Successful Submission

After successful confirmation:

1. Create a queue entry.
2. Generate the next available daily token.
3. Save customer details and selected services.
4. Record the selected staff member, or immediately assign an eligible on-duty staff member (not on break) with the lightest workload when Any Available Stylist is selected.
5. Calculate the estimated waiting time.
6. Navigate to the customer's My Status screen.

The customer should receive a clear confirmation message and their queue token.

## 3.4 Error and Empty States

- Invalid name.
- Missing phone number.
- Invalid 10-digit phone number.
- Duplicate active queue entry.
- No service selected.
- More than three services selected.
- No eligible staff member.
- Online queue closed.
- Salon closed.
- Service temporarily unavailable.
- Submission failure.

## 3.5 Responsive Behaviour

- Mobile: Single-column form, expandable service categories and a clear booking summary.
- Tablet/Desktop: Two-column arrangement where appropriate, with the summary visible alongside the selection area.
- Confirm button should remain easy to access.

---

# 4. Screen 3 — My Status

**Route:** `/status/:id`  
**Primary User:** Customer  
**Purpose:** Allow customers to monitor their queue entry in real time.

## 4.1 Layout — Top to Bottom

### A. Header
- CELESTE logo.
- Language switch.
- My Queue Status heading.

### B. Token Information

Display:
- Queue token, e.g. `S-14`.
- Current queue status.
- Customer name.
- Selected services.
- Assigned staff member.

### C. Queue Position

Display:
- Current position in the queue.
- Number of customers ahead.
- Estimated waiting time.
- Countdown or updated waiting-time indicator.

### D. Start Coming Notification

When the customer reaches position 2 in their assigned staff member's queue:
- Display a prominent Start Coming button and notification explaining that the customer's turn is approaching.
- When clicked, record the acknowledgement on the queue entry and display `Customer on the way` on the Reception Dashboard.
- Clicking Start Coming does not change the customer's queue position or FCFS priority, and does not automatically mark the customer as arrived.

### E. Called Notification

When the customer is called:
- Display a prominent "It's Your Turn!" message.
- Clearly identify the assigned staff member.
- Provide arrival instructions.

### F. Cancellation

- Display Cancel Queue Entry button when cancellation is permitted.
- Require confirmation before cancellation.
- Explain that cancellation cannot be undone.

## 4.2 Interactions

| Element | Action |
|---|---|
| Start Coming | Record the acknowledgement and show `Customer on the way` on Reception Dashboard |
| Cancel Queue Entry | Open confirmation dialog |
| Confirm Cancellation | Cancel the queue entry |
| Keep My Queue | Close cancellation dialog |
| Language switch | Change interface language |

## 4.3 Status Behaviour

The screen must reflect the actual queue status:

- Waiting
- Called
- In Chair
- Done
- Cancelled
- No-show

The customer should see the latest status without manually refreshing the page.

## 4.4 Special States

- Waiting: Show position and estimated waiting time.
- Second in Line (position 2 in assigned queue): Show Start Coming button and notification; show acknowledgement status once clicked.
- Called: Show "It's Your Turn!" notification.
- In Chair: Show that the service has started.
- Done: Show completion confirmation.
- Cancelled: Show cancellation confirmation.
- No-show: Explain the no-show status and joining-again procedure.

## 4.5 Responsive Behaviour

- Mobile: Compact vertical layout with a highly visible token and status.
- Tablet/Desktop: More spacious layout with service and queue information.
- Prioritize the token, status and waiting time.

---

# 5. Screen 4 — Reception Dashboard

**Route:** `/reception`  
**Primary User:** Reception Staff  
**Recommended Device:** Tablet  
**Purpose:** Provide a centralized interface for managing the live salon queue and staff assignments.

## 5.1 Layout — Top to Bottom

### A. Dashboard Header
- CELESTE branding.
- Reception Dashboard heading.
- Current date and time.
- Salon Open/Closed status.
- Online Queue Open/Closed status.
- Language switch.

### B. Queue Overview Cards

Display summary cards for:
- Total waiting customers.
- Customers currently being served.
- Completed customers.
- Average estimated waiting time.

Values should update when queue information changes.

### C. Staff Availability Section

Display five staff cards.

Each card should contain:
- Staff photograph or avatar.
- Name and speciality.
- Availability status.
- Current customer, if any.
- Current service.
- Remaining service time.
- Call Next button.

The Call Next button should only be enabled when the staff member is eligible to receive a customer.

### D. Waiting Queue Table

Display an ordered list of waiting customers (and active called customers requiring arrival tracking).

Columns:
- Queue Token.
- Customer Name.
- Selected Services.
- Assigned / Preferred Staff Member.
- Waiting Time.
- Queue Status (including `Customer on the way` when a position-2 customer acknowledges Start Coming).
- Actions.

The list should follow first-come, first-served order.

### E. Waiting Time Highlight

- Customers waiting more than 60 minutes should be highlighted in amber.
- The highlight should remain subtle and consistent with the CELESTE palette.

### F. Walk-in Management

Include an Add Walk-in button.

Walk-in form fields:
- Customer name.
- Phone number.
- Selected services.
- Staff preference.

Walk-ins should follow the same validation and queue assignment rules as online customers.

### G. Customer Actions

- **Waiting customers:** Must have a **Cancel** action (with confirmation). Waiting customers must not have a No-show action.
- **Called customers:** Display the 10-minute arrival countdown and allow a **No-show** action (with confirmation) only after the 10-minute arrival window expires. Reception may also **Cancel** an entry when necessary (with confirmation).
- **Start Coming status:** Display `Customer on the way` when a customer at position 2 in their assigned queue clicks *Start Coming*. This must not alter queue position or FCFS priority, and must not automatically mark the customer as arrived.

## 5.2 Interactions

| Element | Action |
|---|---|
| Call Next | Call the earliest Waiting customer assigned to the selected staff member |
| Add Walk-in | Open walk-in registration form |
| No-show | Mark a Called customer as No-show after the 10-minute window expires |
| Cancel | Cancel the queue entry |
| Staff card | Show staff availability and current assignment |
| Queue entry | View customer and service details |
| Refresh/live updates | Reflect changes from other screens |

## 5.3 Queue Assignment Behaviour

Staff assignment happens immediately when a customer joins the queue (either their chosen eligible stylist, or the eligible on-duty stylist not on break with the lightest workload for *Any Available Stylist*). This assignment remains unchanged if the staff member later goes on break, and a customer is never silently reassigned.

When reception selects Call Next for a staff member:

1. Ensure the staff member is Available.
2. Find the earliest Waiting customer assigned to that staff member (in FCFS order).
3. Confirm that the staff member is qualified for all selected services.
4. Change the customer's status to Called, record the call time, and start the 10-minute arrival countdown.
5. Update the relevant screens.

## 5.4 Empty and Error States

- No customers waiting.
- No eligible customer for a particular staff member.
- All staff members busy.
- Staff member on break.
- Walk-in form validation failure.
- Queue update failure.

## 5.5 Responsive Behaviour

- Tablet: Primary design target, with staff cards and queue table clearly visible.
- Desktop: Expanded dashboard layout with more columns.
- Mobile: Simplified layout with stacked staff cards and a scrollable queue list.

---

# 6. Screen 5 — Staff / Barber View

**Route:** `/barber/:name`  
**Primary User:** Salon Staff  
**Recommended Device:** Mobile  
**Purpose:** Allow individual staff members to manage their current customer and availability.

## 6.1 Layout — Top to Bottom

### A. Staff Header
- CELESTE branding.
- Staff member name.
- Staff speciality.
- Current availability status.

### B. Current Customer Card

Display:
- Customer name.
- Queue token.
- Selected services.
- Total service duration.
- Assigned customer details.

### C. Service Timer

Display:
- Total service duration.
- Elapsed service time.
- Estimated remaining service time.
- Start/Done controls.

The timer should begin when the staff member starts serving the customer.

### D. Service Actions

- Start Service button.
- Mark Done button.
- Next Customer information.

The staff member should not be allowed to complete a service before starting it.

### E. Availability Controls

Allow staff to:
- Set themselves Available.
- Set themselves On Break.
- Return from Break.

If currently serving a customer, the staff member must not be able to become Available for another assignment.

## 6.2 Interactions

| Element | Action |
|---|---|
| Start Service | Change customer status to In Chair and start timer |
| Mark Done | Mark service as Done |
| Next Customer | Display the next assigned customer when applicable |
| Available | Mark staff as Available |
| On Break | Mark staff as On Break |
| Return from Break | Change status to Available |

## 6.3 Special States

- No current customer: Show a waiting-for-assignment message.
- Customer called: Display customer details and arrival status.
- Service in progress: Display timer and completion action.
- Service completed: Display completion confirmation.
- On Break: Show break status and prevent new assignments.

## 6.4 Responsive Behaviour

- Mobile-first design.
- Large customer token and service details.
- Large, touch-friendly action buttons.
- Minimal unnecessary information.

---

# 7. Screen 6 — Waiting Area TV Display

**Route:** `/display`  
**Primary User:** Salon Visitors  
**Recommended Device:** Television / Large Display  
**Purpose:** Display current and upcoming queue information clearly inside the salon.

## 7.1 Layout

### A. Branding Header
- CELESTE logo.
- Salon name.
- Welcome message.
- Current time.

### B. Staff Queue Section

Display one row or card per staff member.

Each should contain:
- Staff photograph.
- Staff name.
- Current queue token.
- Current status if relevant.

### C. Next Five Customers

Display the next five eligible queue tokens with:
- Token number.
- Assigned staff member.
- Estimated waiting time.

Only appropriate waiting customers should be shown.

### D. Called Customer Highlight

When a customer is called:
- Highlight the called token using a gold/champagne visual treatment.
- Make the called token clearly distinguishable.
- Play an audible chime or notification sound.
- Ensure the announcement is visible long enough to be noticed.

## 7.2 Interactions

This is primarily a display-only screen.

- Automatically update queue information.
- Highlight newly called tokens.
- Play the notification sound when a new customer is called.
- Support full-screen display.

## 7.3 Special States

- No waiting customers: Display a welcoming empty-queue message.
- No active staff: Display an appropriate availability message.
- Called customer: Highlight the token.
- Connection failure: Display a clear connection warning.

## 7.4 Responsive Behaviour

- Designed primarily for landscape television displays.
- Large fonts and high contrast.
- Information must be readable from a distance.
- Avoid small buttons and unnecessary navigation.
- Maintain a clean, uncluttered layout.

---

# 8. Screen 7 — Owner Settings

**Route:** `/admin`  
**Primary User:** Salon Owner  
**Recommended Device:** Desktop / Tablet  
**Purpose:** Allow the owner to manage salon services, staff availability, online queue settings and daily statistics.

## 8.1 Layout — Top to Bottom

### A. Admin Header
- CELESTE branding.
- Owner Dashboard heading.
- Current date.
- Language switch.

### B. Service Management

Display a manageable service list.

Each service should contain:
- Service name in English.
- Service name in Gujarati.
- Category.
- Duration in minutes.
- Price in INR.
- Active/Inactive status.

Actions:
- Add Service.
- Edit Service.
- Enable/Disable Service.

Validation:
- Service name is required in both languages.
- Duration must be valid and greater than zero.
- Price must not be negative.
- Inactive services cannot be selected by customers.

### C. Staff Management

Display all five staff members.

Each staff member should have:
- Name.
- Role or speciality.
- On-duty toggle.
- Current availability.

The owner should be able to control whether staff members are on duty.

Staff should not be made available for new assignments while they are serving a customer.

### D. Online Queue Settings

Display:
- Online Queue Open/Closed toggle.
- Current salon operating status.
- Next closing time.
- Automatic queue-closing information.

The owner can manually open or close online queue joining.

### E. Daily Statistics

Display useful daily metrics:
- Total customers served.
- Total waiting customers.
- Completed services.
- Cancelled queue entries.
- No-show count.
- Daily revenue based on completed services.

Statistics should update as queue entries are completed or cancelled.

## 8.2 Interactions

| Element | Action |
|---|---|
| Add Service | Open new service form |
| Edit Service | Update service information |
| Enable/Disable | Change service availability |
| Staff duty toggle | Change staff duty status |
| Online Queue toggle | Open or close online queue joining |
| Statistics cards | Display current daily figures |

## 8.3 Special States

- No services configured.
- No staff members on duty.
- Online queue manually closed.
- Salon automatically closed.
- Invalid service details.
- Failed settings update.

## 8.4 Responsive Behaviour

- Desktop: Full management dashboard.
- Tablet: Stacked management sections and responsive tables.
- Mobile: Simplified settings layout with manageable forms.

---

# 9. Cross-Screen Consistency Requirements

The following behaviours must remain consistent across the application.

| Event | Screens That Must Update |
|---|---|
| Customer joins queue | Home, Join Queue, My Status, Reception, TV |
| Customer is called | My Status, Reception, Staff View, TV |
| Staff starts service | My Status, Reception, Staff View, TV |
| Service is completed | My Status, Reception, Staff View, TV |
| Customer cancels | Home, Reception, TV, My Status |
| Customer clicks Start Coming | My Status, Reception |
| Customer marked No-show | Reception, My Status, TV |
| Staff goes on break | Home, Join Queue, Reception, Staff View |
| Staff returns Available | Home, Join Queue, Reception, Staff View |
| Owner updates a service | Home/Join Queue and relevant owner views |
| Online queue is closed | Home and Join Queue |

All screens should display consistent, current data rather than separate hardcoded sample values.

# 10. Final Screen Checklist

Before considering the screen implementation complete, verify:

- [ ] All seven required screens exist.
- [ ] Every screen follows CELESTE's visual identity.
- [ ] Every button and interactive control works.
- [ ] English and Gujarati are supported.
- [ ] Customer forms have appropriate validation.
- [ ] Empty states and error states are handled.
- [ ] Queue information updates across relevant screens.
- [ ] Staff availability is synchronized.
- [ ] Responsive layouts work on phone, tablet and TV.
- [ ] Text is readable and does not overflow.
- [ ] Queue status is communicated through text as well as colour.
- [ ] The approved CELESTE dashboard mockup is followed as a visual reference.

---

**Document Status:** Draft for Review  
**Project:** CELESTE — Salon Queue Management System