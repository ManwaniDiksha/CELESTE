# CELESTE — Salon Queue Management System

## 1. Project Overview

**Project Name:** CELESTE — Salon Queue Management System  
**Project Type:** Web-based queue management application  
**Academic Context:** MSc IT — Introduction to Programming

CELESTE is a digital queue management system for a fictional unisex luxury salon. The application aims to make salon visits more organized and convenient by allowing customers to join a queue, select services and preferred staff members, and monitor their queue status.

The system also provides reception staff with a dashboard to manage customers, salon staff with individual work views, salon visitors with a live waiting-area display, and the owner with management settings and daily statistics.

The application must implement all seven screens and the sample features described in the assignment handout. None of the required screens or sample features should be omitted.

## 2. Problem Statement

Traditional salon queue management can involve manual registers, verbal communication, uncertain waiting times, and difficulty coordinating customers with available staff.

CELESTE aims to address these problems through a centralized digital system that:

- Allows customers to join the salon queue digitally.
- Provides queue tokens and estimated waiting times.
- Allows customers to select services and preferred staff members.
- Helps reception staff manage waiting customers and walk-ins.
- Helps staff manage their current customers and availability.
- Displays live queue information in the salon waiting area.
- Allows the owner to manage services, staff availability, and online queue settings.

## 3. Target Users

### 3.1 Customers
Customers should be able to:
- View salon information and current queue conditions.
- Check whether the salon is open.
- Join the queue by entering their details.
- Select up to three services.
- Choose a preferred staff member or Any Available Stylist.
- View the estimated total price and service duration.
- Receive a queue token.
- Track their queue position and estimated waiting time.
- Cancel their queue entry with confirmation.
- Know when it is time to start coming to the salon or when it is their turn.

### 3.2 Reception Staff
Reception staff should be able to:
- View the live queue.
- Monitor staff availability.
- Call the next eligible customer for a particular staff member.
- Add walk-in customers.
- Mark customers as No-show or Cancelled.
- View customer details, selected services, preferred staff and waiting time.

### 3.3 Salon Staff
Salon staff should be able to:
- View their current customer and selected services.
- Start and complete a service.
- View the total, elapsed, and estimated remaining service time.
- Move to the next customer.
- Change their availability status, including going on break.

### 3.4 Salon Owner
The owner should be able to:
- Manage salon services, prices and durations.
- Maintain English and Gujarati service names.
- Enable or disable services.
- Manage staff duty availability.
- Open or close online queue joining.
- View daily salon statistics.

## 4. Core Application Screens

The application must include all seven screens specified in the assignment.

| No. | Screen | Route | Primary User |
|---|---|---|---|
| 1 | Home | `/` | Customer |
| 2 | Join Queue | `/join` | Customer |
| 3 | My Status | `/status/:id` | Customer |
| 4 | Reception Dashboard | `/reception` | Reception |
| 5 | Barber / Staff View | `/barber/:name` | Salon Staff |
| 6 | Waiting Area TV Display | `/display` | Salon Visitors |
| 7 | Owner Settings | `/admin` | Owner |

The detailed layout, components, interactions and responsive behaviour of each screen will be documented in `docs/02-screens.md`.

## 5. Must-Have Features

### 5.1 Customer Queue Management
- Customer name and 10-digit phone number input.
- Phone number validation.
- Selection of up to three services.
- Service prices and estimated durations.
- Preferred staff selection or Any Available Stylist.
- Live total price and service duration calculation.
- Queue token generation.
- Live queue position and estimated waiting time.
- Customer cancellation with confirmation.
- One active queue entry per phone number.

### 5.2 Queue and Staff Assignment
- First-come, first-served queue management.
- Staff-specific queue assignment.
- Customers selecting a particular staff member must never be assigned to another staff member.
- Customers selecting Any Available Stylist are immediately assigned upon joining to an eligible on-duty staff member (not on break) using workload-based selection.
- All services in one customer's queue entry must be handled by the same staff member.
- Staff must only be assigned services within their defined specialities.
- Each staff member can serve only one customer at a time.
- Staff availability must be reflected across the application.

### 5.3 Reception Management
- Live queue list.
- Staff availability cards.
- Call Next functionality.
- Add walk-in functionality.
- No-show and cancellation controls.
- Waiting-time visibility.
- Waiting customers who have waited more than 60 minutes must be highlighted in amber.

### 5.4 Staff Management
- Individual staff view.
- Current customer information.
- Selected services.
- Service timer.
- Start and Done actions.
- Next customer information.
- Available, Busy and On Break states.

### 5.5 Waiting Area Display
- Staff names and photographs.
- Current customer token for each staff member.
- Next five queue tokens and their estimated waiting times.
- Called token highlighted with a gold visual effect.
- Audible notification when a token is called.

### 5.6 Owner Settings
- Service management.
- English and Gujarati service names.
- Service duration and price management.
- Service activation and deactivation.
- Staff on-duty controls.
- Online queue open/closed control.
- Daily statistics.

### 5.7 Language Support
- English as the default language.
- Gujarati as an alternative language.
- Language switching across all seven screens.
- Proper Gujarati text rendering without clipping or layout problems.

## 6. CELESTE Brand Identity and Visual Direction

**Brand Name:** CELESTE  
**Business Type:** Unisex Luxury Salon

### Brand Personality
- Elegant
- Sophisticated
- Contemporary
- Welcoming
- Refreshing
- Inclusive

### Visual Direction
The application should follow a **Fresh Modern Luxury** design direction, combining a light, airy interface with subtle luxury details.

The design should feel premium without becoming overly decorative, excessively feminine or difficult to read.

### Primary Colour Palette

| Colour | HEX | Purpose |
|---|---|---|
| Celeste Sage | `#526B5D` | Primary brand colour |
| Deep Sage | `#3F594B` | Hover and emphasis |
| Soft Sage | `#E7EEE8` | Soft backgrounds |
| Warm Ivory | `#F8F7F3` | Main background |
| Pure White | `#FFFFFF` | Cards and surfaces |
| Deep Charcoal Green | `#303B39` | Main text |
| Dusty Blue | `#718A9B` | Secondary accent |
| Champagne Beige | `#D9C8AE` | Luxury accent |
| Muted Rosewood | `#946F69` | Occasional decorative accent |

The detailed colour tokens and status colours will be maintained consistently across all screens.

### Typography
- Elegant serif typography for headings and the brand identity.
- Clean, readable sans-serif typography for body text and interface elements.

### UI Styling
- Rounded cards and buttons.
- Generous but practical spacing.
- Subtle borders and shadows.
- Clear visual hierarchy.
- Consistent icons.
- Minimal decorative effects.
- Responsive layouts.

### Accessibility
- Aim for WCAG AA text contrast: 4.5:1 for normal text and 3:1 for large text.
- Do not communicate queue or staff status through colour alone.
- Provide visible focus indicators.
- Use readable font sizes.
- Maintain touch-friendly controls.
- Ensure layouts work across phones, tablets and large TV displays.

The approved CELESTE dashboard mockup is the visual reference for the application's overall appearance.

## 7. Salon Information and Operating Hours

| Day | Opening Time | Closing Time |
|---|---|---|
| Monday–Friday | 10:00 AM | 9:00 PM |
| Saturday | 9:00 AM | 10:00 PM |
| Sunday | 10:00 AM | 8:00 PM |

Additional rules:
- Online queue joining closes 30 minutes before closing time.
- Walk-ins can still be accepted until closing time.
- The owner can manually open or close online queue joining.
- Salon open/closed status should update automatically according to operating hours.

## 8. Initial Service Catalogue

CELESTE will initially offer 33 services across four categories.

### Hair
Haircut, Hair Trim, Hair Wash, Blow Dry, Hair Styling, Hair Spa, Deep Conditioning, Hair Colour, Root Touch-up, Highlights, Keratin Treatment and Smoothening.

### Beard & Grooming
Beard Trim, Beard Styling, Clean Shave, Hairline & Neck Cleanup, Head Shave and Grooming Package.

### Skin
Basic Clean-up, Classic Facial, Premium Facial, De-tan Treatment, Face Bleach, Eyebrow Threading, Upper Lip Threading and Face Waxing.

### Hands & Feet
Basic Manicure, Spa Manicure, Basic Pedicure, Spa Pedicure, Nail Polish, Gel Polish and Nail Art.

Each service will have:
- A service name in English and Gujarati.
- A duration in minutes.
- A price in INR.
- An active/inactive setting.

The detailed initial prices and durations will be maintained in the service catalogue used during implementation.

## 9. Initial Salon Staff

CELESTE will have five staff members.

| Name | Role | Speciality |
|---|---|---|
| Aarav | Senior Hair Stylist | Haircuts, styling and hair treatments |
| Meera | Hair & Colour Specialist | Hair colouring, highlights and smoothening |
| Kabir | Barber & Grooming Specialist | Beard, shaving and grooming |
| Riya | Skin & Beauty Specialist | Facials, clean-ups and threading |
| Ananya | Nail & Beauty Specialist | Manicure, pedicure and nail art |

Staff availability states:
- Available
- Busy
- On Break

A customer must be assigned to one staff member who can perform all selected services. A customer's selected staff preference must be respected.

## 10. Features and Scope Boundaries

### Included in the Project
- All seven screens from the assignment handout.
- All sample features specified in the handout.
- Customer queue joining and tracking.
- Reception and walk-in management.
- Staff service management.
- Live waiting-area display.
- Owner settings and daily statistics.
- English and Gujarati language support.
- Responsive UI for phone, tablet and TV.
- Working queue and staff assignment rules.
- Persistent application data and synchronized screen updates.

### Not Included Unless Explicitly Required Later
- Online payment gateway.
- Customer loyalty or reward points.
- Product inventory and stock management.
- Home-service bookings.
- Third-party appointment booking integrations.
- Customer social networking or reviews.

These exclusions must not be used to remove or simplify any mandatory feature from the assignment handout.

## 11. General Project Requirements

- The application must be functional, not just a static UI mockup.
- All buttons and controls must perform their intended actions.
- Queue updates must be reflected across relevant screens.
- Customer and staff information must remain consistent.
- Form validation and error messages must be provided.
- Empty states should be handled gracefully.
- The interface must be responsive.
- The application should be tested with realistic sample data.
- The code should remain understandable and maintainable for a beginner-level academic project.

## 12. Project Success Criteria

The project will be considered successful when:

1. All seven required screens are implemented.
2. Customers can join and track the queue.
3. Queue assignment follows the specified rules.
4. Reception can manage customers and walk-ins.
5. Staff can manage their service status.
6. The waiting-area display reflects live queue information.
7. The owner can manage services, staff availability and online queue settings.
8. English and Gujarati work across the application.
9. The interface follows the CELESTE design direction.
10. The application works responsively and passes the required test checklist.

---

**Document Status:** Draft for review  
**Project:** CELESTE — Salon Queue Management System