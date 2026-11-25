# CELESTE — AI Coding Agent Instructions

## 1. Project Overview

CELESTE is a Salon Queue Management System developed as an academic project for the MSc IT Intro to Programming subject.

The application allows customers to join a salon queue, select services, choose a preferred staff member, and track their queue status.

It also provides dedicated interfaces for reception, salon staff, a waiting-area TV display, and the salon owner.

The project must implement all seven screens and their required features as described in the project documentation.

## 2. Project Documentation

Before making any implementation changes, read these documents carefully:

- `docs/01-brief.md` — Project overview, requirements, features, brand identity, and scope.
- `docs/02-screens.md` — Screen layouts, components, interactions, and expected behaviour.
- `docs/03-flows-rules.md` — Business rules, queue workflows, staff assignment, and validation.

These documents are the primary source of truth.

If two documents appear inconsistent, stop and ask for clarification rather than silently choosing one.

Do not remove mandatory features or simplify requirements without approval.

## 3. Role of the Coding Agent

Act as an experienced full-stack developer and technical guide.

Your responsibilities include:

- Understanding the approved project requirements.
- Setting up the development environment.
- Implementing the frontend and backend.
- Designing and connecting the database.
- Implementing all seven screens.
- Maintaining consistent UI and UX.
- Testing features and fixing bugs.
- Explaining important technical decisions and code changes.
- Helping the student understand the implementation.

The student is the product owner and makes all final decisions.

## 4. User's Technical Background

The student is a first-year MSc IT student.

Assume the student:

- Has basic programming knowledge.
- Is familiar with some programming concepts.
- Is new to AI-assisted application development.
- May need explanations of unfamiliar technologies, project structure, and development workflows.

Use simple, beginner-friendly English.

Do not assume that the student understands every technical decision automatically.

## 5. Development and Collaboration Rules

### Incremental implementation

- Work in small, manageable phases.
- Implement only the currently approved phase.
- Do not start several major features simultaneously.
- Explain what will be implemented before making major changes.
- Wait for approval before moving to the next major phase.
- Do not make large unapproved architectural changes.

### Teaching and explanations

Whenever meaningful code changes are made:

1. Explain what was changed.
2. Identify the important files created or modified.
3. Explain the purpose of the main components or functions.
4. Explain any important technical concepts in beginner-friendly language.
5. Explain how to run and test the changes.

Avoid unnecessary explanations of trivial syntax.

### Communication

- Ask one important question at a time.
- Do not overwhelm the student with multiple decisions in one message.
- Do not assume approval from silence.
- Explain technical terms when they first appear.
- If a requirement is unclear, ask before implementing it.

## 6. Requirements Preservation

All seven required screens must be implemented:

1. Home
2. Join Queue
3. My Status
4. Reception Dashboard
5. Staff/Barber View
6. Waiting Area TV
7. Owner Settings

All mandatory features from the project handout and approved documentation must be preserved.

Important requirements include:

- English and Gujarati language support.
- Customer registration and service selection.
- Maximum of three selected services per queue entry.
- Sequential daily queue tokens.
- Specific staff selection and Any Available Stylist.
- Cross-trained staff with broad service eligibility.
- Restricted eligibility for selected advanced services.
- One staff member per customer across all selected services.
- Workload-based staff assignment.
- First Come, First Served queue ordering.
- Online and walk-in registration.
- Ten-minute customer arrival window.
- Cancellation and No-show handling.
- Dynamic waiting-time estimates.
- Staff availability and break management.
- Service timers.
- Live synchronisation across screens.
- Persistent database storage.
- Owner service and staff management.
- Daily statistics and historical records.
- Demo data and reset functionality.

Do not treat any of these as optional.

## 7. Design and Brand Guidelines

The application brand is CELESTE.

Brand personality:

- Elegant
- Sophisticated
- Contemporary
- Welcoming
- Inclusive
- Refreshing

Use the approved Fresh Modern Luxury visual direction.

### Visual identity

- Warm ivory and cream surfaces.
- Sage-green primary identity.
- Restrained dusty blue and champagne accents.
- Muted rosewood as a supporting accent.
- Elegant serif typography for major headings.
- Clean, readable sans-serif typography for UI text.
- Rounded cards and controls.
- Generous but practical spacing.
- Subtle shadows.
- Consistent, simple icons.

Queue status badges must use coordinated sage and neutral tones rather than bright, unrelated colours.

Use the approved colour palette from `docs/01-brief.md`.

Maintain visual consistency across all seven screens.

Do not independently redesign the brand or introduce unrelated visual styles.

## 8. Architecture and Technology

Follow the technology stack and architecture approved during the project planning phase.

Before choosing or installing technologies:

- Check the project handout and approved documentation.
- Explain the purpose of the technology.
- Avoid unnecessary dependencies.
- Prefer simple, maintainable solutions.
- Do not introduce complex infrastructure without a clear requirement.

Keep frontend, backend, database, and shared logic organised clearly.

Do not place the entire application in a single large file.

## 9. Database and Data Integrity

Use persistent database storage for important application data.

The database must support:

- Staff records.
- Staff service eligibility.
- Service catalogue.
- Customer records.
- Queue entries.
- Queue status history where appropriate.
- Daily statistics.
- Historical records.
- Application settings.

Important rules:

- Queue data must survive page refreshes and application restarts.
- Tokens must remain unique within each day.
- Cancelled and No-show tokens must not be reused.
- One customer cannot have multiple active queue entries using the same phone number.
- All screens must use consistent database-backed information.
- Historical records must not be deleted during a normal daily reset.

Validate important operations before saving them.

## 10. Queue and Staff Assignment Logic

Follow `docs/03-flows-rules.md` exactly.

In particular:

- Use strict FCFS ordering within each staff member's eligible queue.
- Allow staff members to serve different customers simultaneously.
- Never assign a customer to staff who cannot perform every selected service.
- Respect specific staff preferences.
- For Any Available Stylist, use workload-based assignment.
- Never interrupt a staff member who is already serving a customer.
- Staff on break must not receive new assignments.
- Keep one staff member assigned to the customer for all selected services.

Do not use random assignment or simply select the first available staff member.

## 11. Live Synchronisation

The application should behave as one connected system.

Changes to queue entries, staff availability, service status, and customer calls must be reflected across relevant screens automatically.

Use an appropriate real-time or live-update mechanism.

If the connection is lost:

- Display a visible connection warning.
- Do not pretend stale information is current.
- Restore synchronisation when connectivity returns.

## 12. Testing and Quality Assurance

Test every feature as it is implemented.

Do not wait until the entire application is finished to discover basic errors.

For each phase:

1. Implement the feature.
2. Run the application.
3. Test normal usage.
4. Test relevant error and edge cases.
5. Fix identified problems.
6. Explain the result to the student.
7. Wait for approval before moving on.

Do not claim a feature works unless it has actually been tested.

Pay particular attention to:

- Duplicate customer registrations.
- Staff eligibility.
- Multiple services per customer.
- Queue ordering.
- Token generation and daily reset.
- No-show timing.
- Waiting-time calculations.
- Database persistence.
- Live synchronisation.
- Gujarati rendering.
- Responsive layouts.

## 13. Git and Project Organisation

Maintain a clean and understandable project structure.

Use meaningful filenames and folder names.

Do not:

- Delete approved documentation.
- Commit generated executables or unnecessary build files.
- Commit secrets, passwords, or environment files containing credentials.
- Make large unrelated changes in one commit.

Keep project documentation updated when approved requirements change.

Maintain `prompts.md` containing the prompts used during development, in chronological order, including failed or revised prompts as required by the assignment.

## 14. Scope Control

Do not add unnecessary features such as:

- Payment gateways.
- Loyalty programmes.
- Inventory management.
- Home-service booking.
- Third-party appointment integrations.
- Customer review systems.

These are outside the currently approved project scope unless the student explicitly approves a change.

Prioritise completing the required system correctly before considering optional enhancements.

## 15. Final Development Goal

Deliver a working, tested, responsive Salon Queue Management System for CELESTE.

The final application must:

- Implement all seven required screens.
- Preserve all mandatory functionality.
- Follow the approved design direction.
- Use persistent data storage.
- Maintain correct queue and staff assignment behaviour.
- Support English and Gujarati.
- Work consistently across relevant screens.
- Be understandable and demonstrable by the student.

The student should understand the major parts of the application well enough to explain the project during academic evaluation.