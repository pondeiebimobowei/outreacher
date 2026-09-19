# `docs/experience/home-workspace.md`

````md
# Home / Workspace Experience Contract

**Status:** APPROVED  
**Experience Area:** Home / Workspace  
**Scope:** The authenticated user's primary workspace entry point and operational starting surface  
**Authority:** Experience layer contract  
**Related Experiences:** `auth-onboarding.md`, `company.md`, `research.md`, `opportunity.md`, `contact.md`, `outreach.md`, `campaign.md`, `email-replies.md`, `responsive-accessibility.md`

---

## 1. Purpose

The Home / Workspace experience is the user's operational starting point after authentication.

It should answer, quickly:

1. Where am I?
2. What requires my attention?
3. What work is currently active?
4. What should I do next?
5. How do I continue an existing workflow?
6. How do I start a new company-first workflow?

Home is not a generic analytics dashboard.

It is not primarily a collection of charts, vanity metrics, or database summaries.

It is the user's **orientation and continuation surface**.

The workspace should help the user move from:

```text
"I've opened Outreacher."
        ↓
"I know what needs attention."
        ↓
"I understand my active work."
        ↓
"I know what to do next."
````

---

# 2. Product Context

Outreacher's canonical workflow is:

```text
Signup
→ Career Profile
→ Enter Company
→ Research Company
→ Establish Opportunity State
→ Discover Contacts
→ Review Evidence
→ Select Contact
→ Generate Outreach
→ Human Review/Edit
→ Create Campaign
→ Send Email
→ Receive Reply
→ Stop Follow-ups
→ Record Outcome
```

Home must represent this workflow without replacing it.

The workspace should provide orientation across active work while the domain experiences remain responsible for their own tasks.

---

# 3. Core Experience Principle

## Home is a continuation surface, not a destination

The user should not need to repeatedly reconstruct where they left off.

The workspace should surface meaningful active work such as:

```text
Company research awaiting review
Contact selected, outreach not yet reviewed
Outreach draft awaiting approval
Campaign scheduled
Campaign needs attention
Reply received
Conversation awaiting response
```

The home experience should connect these states back to their underlying company and opportunity.

---

# 4. Primary Jobs

Home must support five primary jobs.

### JOB-01 — Orient

Understand the current state of the workspace.

### JOB-02 — Continue

Resume meaningful work already in progress.

### JOB-03 — Attend

See work requiring user attention.

### JOB-04 — Start

Begin a new company-first workflow.

### JOB-05 — Review

Understand recent activity without turning Home into an exhaustive activity log.

---

# 5. Primary Hierarchy

The default hierarchy is:

```text
Workspace identity
        ↓
Attention / action required
        ↓
Primary next action
        ↓
Active work
        ↓
Recent activity
        ↓
Secondary workspace information
```

The hierarchy must remain task-oriented.

Avoid:

```text
Huge "Welcome back"
        ↓
Decorative statistics
        ↓
Several charts
        ↓
Random recent records
        ↓
Actual work
```

The user's work should appear before decorative or low-value analytics.

---

# 6. Recommended Composition

A desktop workspace may follow this structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ Global navigation                              Profile      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Good morning, [Name]                                       │
│ Your workspace                                             │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Needs your attention                                    │ │
│ │                                                         │ │
│ │ Reply received from Company A                    [Open] │ │
│ │ Outreach draft awaiting review                     [Review]│
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌──────────────────────────────┐ ┌────────────────────────┐ │
│ │ Continue working             │ │ Start something new    │ │
│ │                              │ │                        │ │
│ │ Company A                    │ │ Research a company     │ │
│ │ Research in progress        │ │                        │ │
│ │                              │ │ [Add company]          │ │
│ │ Company B                    │ │                        │ │
│ │ Campaign scheduled          │ │                        │ │
│ └──────────────────────────────┘ └────────────────────────┘ │
│                                                             │
│ Recent activity                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

This is a compositional direction, not a mandatory component implementation.

---

# 7. Workspace Identity

The workspace should establish location immediately.

The user should understand:

```text
Outreacher
→ Home
```

or the equivalent product navigation context.

The page should have one clear primary heading.

A greeting may be used, but it must not replace the actual page identity.

Prefer:

```text
Good morning, Pondei

Your workspace
```

over making:

```text
Good morning, Pondei!
```

the only meaningful heading.

---

# 8. Attention Area

> [!WARNING]  
> **Capability Gap (Packet 8.5):** The backend currently has no `Reply` domain, `Message` domain, or read/unread state. While "Reply received" is listed below as a theoretical attention item, the Home implementation must explicitly exclude it until a separate Reply domain contract is introduced. Home must treat this as a known capability gap and not silently infer "zero replies".

The highest-value area of Home is work that requires a user decision or action.

Examples:

```text
Reply received
→ Respond

Outreach draft awaiting review
→ Review

Research partially completed
→ Review findings

Campaign failed
→ Investigate

Campaign paused
→ Review / Resume

Contact selected
→ Prepare outreach
```

The exact states must be derived from authoritative domain state.

Home must not invent a new business state merely for dashboard presentation.

---

# 9. Attention Priority

Attention items should be ordered by **required action and urgency**, not by arbitrary record sorting.

The system may surface:

* new replies
* blocked workflows
* failed actions
* approval-required outreach
* campaigns requiring attention
* unfinished research
* incomplete contact selection

However, Home must not create an unexplained ranking such as:

```text
Priority Score: 97
Priority Score: 82
Priority Score: 61
```

unless such a scoring system is explicitly defined and governed elsewhere.

The reason an item appears should be understandable.

---

# 10. Attention Item Structure

An attention item should expose enough information to decide whether to open it.

Example:

```text
Reply received

Sarah Johnson
Director of Talent

Company:
Example Company

Context:
Responded to your outreach

Received:
Today

[Open conversation]
```

The item should not require the user to guess:

* who
* which company
* why it matters
* what happened
* what action is expected

---

# 11. Attention States

The attention area should support:

### Has attention

Show actionable items.

### No attention

Do not manufacture activity.

Example:

```text
You're caught up

Nothing currently requires your attention.
Your active work is still available below.
```

### Loading

Preserve the workspace structure while data loads.

### Partial failure

If one source of workspace information fails, preserve the rest where possible.

Example:

```text
Recent activity is temporarily unavailable.

[Retry]
```

Do not turn a partial failure into a blank dashboard.

### Complete failure

If Home cannot retrieve the information required to operate safely:

```text
We couldn't load your workspace.

Your work hasn't been changed.

[Try again]
```

---

# 12. Primary Workspace Action

Home should provide a clear mechanism for starting a new company workflow.

The primary creation action should be aligned with the actual product model.

Prefer:

```text
Add company
```

or:

```text
Research a company
```

depending on the approved interaction design.

Do not make generic actions such as:

```text
Create record
New item
Add entity
```

the primary product action.

The user is trying to pursue an opportunity, not manage database objects.

---

# 13. Continue Working

Home should surface active workflows that are not necessarily blocked but are useful to continue.

Examples:

```text
Example Company
Research complete
Next: Review opportunity

Acme Inc.
Contact selected
Next: Review outreach

Beta Corp
Campaign scheduled
Next activity: Sep 21
```

Each item should communicate:

* company
* current meaningful state
* next meaningful action

---

# 14. Active Work

Active work should represent actual product workflows.

Potential categories include:

```text
Research in progress
Opportunity awaiting decision
Contact discovery
Outreach draft
Campaign
Conversation
```

Do not treat every database row as active work.

A company that has not been touched recently does not necessarily belong in an "active" section.

---

# 15. Company-First Mental Model

The Home experience should reinforce the product's company-first model.

The primary object users should recognize is:

```text
Company
```

with related work:

```text
Opportunity
Research
Contact
Outreach
Campaign
Conversation
```

Avoid making Home feel like:

```text
Contacts
Campaigns
Emails
Companies
Templates
```

are unrelated applications.

The product's differentiating mental model is:

```text
Company
   ↓
Why this company?
   ↓
What opportunity exists?
   ↓
Who should I contact?
   ↓
Why this person?
   ↓
What should I say?
   ↓
What happened?
```

Home should reinforce that continuity.

---

# 16. Active Company Card

Where a company is surfaced on Home, its representation should remain contextual.

Example:

```text
Example Company

PROACTIVE

Research completed
Relevant contact identified

Next:
Review outreach draft

[Continue]
```

Avoid a generic company card containing only:

```text
Example Company
Technology
Lagos
Website
```

That is directory information, not workflow information.

---

# 17. Opportunity State

When opportunity state is surfaced on Home, use the authoritative states:

```text
CONFIRMED
PROACTIVE
UNCLASSIFIED
```

The meaning of the state must remain clear.

Home must not reinterpret:

```text
PROACTIVE
```

as:

```text
High potential
```

or:

```text
Hot lead
```

unless such terminology is explicitly approved by the product requirements.

Likewise, Home must not imply that:

```text
CONFIRMED
```

means the user has secured an interview, referral, or job.

Opportunity state describes the evidence-supported state of the opportunity.

---

# 18. Recent Activity

Recent activity should provide orientation rather than become a full audit log.

Useful events may include:

```text
Research completed
Contact selected
Outreach approved
Campaign scheduled
Email sent
Reply received
Campaign stopped
Outcome recorded
```

Each event should identify the relevant company or workflow.

Example:

```text
Today

Reply received
Example Company
Sarah Johnson replied to your outreach

2 hours ago

Campaign scheduled
Acme Inc.
Campaign begins Sep 21
```

---

# 19. Activity Integrity

Home must distinguish between:

```text
System event
User action
Provider event
AI-generated action
```

where the distinction matters.

For example:

```text
Outreach approved
```

must not appear as:

```text
Outreach sent
```

and:

```text
Email send attempted
```

must not appear as:

```text
Email sent
```

Home is not allowed to simplify away operationally important state.

---

# 20. Metrics

Metrics are secondary.

Potential factual metrics may include:

```text
Active companies
Active campaigns
Awaiting replies
Unread replies
```

Only show metrics that have a clear user purpose.

Avoid vanity metrics such as:

```text
Your productivity score
Outreach health
Success score
Career momentum
AI score
```

unless those concepts are explicitly defined by product requirements.

---

# 21. No Artificial Success Narrative

Home must not imply career outcomes that the system does not know.

For example, do not convert:

```text
12 emails sent
3 replies
```

into:

```text
You're getting closer to your next job!
```

unless the product has evidence supporting that statement.

Likewise:

```text
Reply received
```

must not become:

```text
Great opportunity!
```

or:

```text
Interview likely!
```

The workspace reports known state.

It does not manufacture career interpretation.

---

# 22. Empty Workspace

A new workspace should not look broken.

The empty state should orient the user around the product's primary workflow.

Example:

```text
Start with a company

Outreacher helps you turn a company you care about
into an evidence-backed outreach opportunity.

Add a company to begin researching.

[Add company]
```

Optional supporting explanation:

```text
You don't need a confirmed job opening to start.
```

Only include this if consistent with the authoritative product requirements.

---

# 23. Partially Started Workspace

If the user has begun work but has not completed the workflow:

```text
Continue where you left off

Example Company

Research completed
Opportunity needs review

[Continue]
```

The user should not have to remember which screen they were on.

---

# 24. First-Time Workspace

After onboarding, Home should provide a clear next step without becoming a tutorial.

Prefer:

```text
You're ready to start.

Find a company you want to pursue.

[Add company]
```

Avoid:

```text
Step 1...
Step 2...
Step 3...
Step 4...
```

unless onboarding explicitly requires guided progression.

Home is an operational surface, not a product tour.

---

# 25. Workspace Navigation

Global navigation should provide access to major product areas while preserving the company-first mental model.

The exact navigation labels must follow the approved product information architecture.

Potential structure:

```text
Home
Companies
Campaigns
Templates
Settings
```

Additional areas such as replies may appear as a dedicated destination or as part of campaign/conversation navigation depending on the approved information architecture.

This document does not redefine the global navigation contract.

---

# 26. Current Location

The user must always be able to determine that they are on Home.

Use combinations of:

* active navigation state
* page heading
* browser/document title
* appropriate landmarks

Do not rely solely on:

```text
different background color
```

to communicate the current location.

Consistent navigation and clear orientation are part of W3C's accessibility guidance. ([W3C][1])

---

# 27. Responsive Composition

Home must adapt rather than simply shrink.

### Wide

Use:

```text
Attention
+
Continue working
+
Start new workflow
+
Recent activity
```

where the available space supports meaningful parallel presentation.

### Medium

Allow:

```text
Attention
↓
Continue working
↓
Start new workflow
↓
Recent activity
```

or a two-column variation where useful.

### Compact

Prioritize:

```text
Page identity
↓
Attention
↓
Primary action
↓
Continue working
↓
Recent activity
```

Secondary metrics may move below these sections or be omitted.

The user's ability to continue work must never depend on desktop width.

---

# 28. Mobile Attention Cards

On compact layouts, attention items should remain individually understandable.

Example:

```text
Reply received

Sarah Johnson
Example Company

Needs your response

[Open conversation]
```

Do not reduce an attention item to:

```text
Reply
[>]
```

where the user must open it merely to understand what happened.

---

# 29. Responsive Navigation

On smaller screens:

* global navigation may collapse
* the current section must remain clear
* navigation controls must be keyboard accessible
* the menu must have an accessible name
* opening the menu must establish appropriate focus
* closing it must return focus appropriately
* navigation must not obscure critical task content indefinitely

Repeated navigation should remain consistent across the product. W3C identifies consistent navigation as an accessibility requirement because predictable placement helps users orient themselves. ([W3C][2])

---

# 30. Keyboard Experience

Home must be fully usable by keyboard.

A meaningful keyboard sequence should resemble:

```text
Skip navigation
→ primary page heading
→ primary action
→ attention items
→ continue-working items
→ recent activity
→ secondary navigation
```

The exact DOM order may vary, but the interaction order must remain meaningful.

All functionality available by pointer must also be available by keyboard. ([W3C][1])

---

# 31. Focus Behavior

When a user:

* opens a navigation menu
* opens an attention detail dialog
* opens a confirmation dialog
* expands a section

focus must move predictably.

When the transient surface closes, focus should return to the originating control unless the resulting workflow requires a deliberate transition elsewhere.

Focused controls must not be hidden behind sticky headers, footers, or overlays. WCAG 2.2 explicitly addresses minimum focus visibility in the presence of author-created content. ([W3C][3])

---

# 32. Accessible Workspace Structure

The Home page should expose meaningful semantic regions where appropriate:

```text
Header
Navigation
Main
    Page heading
    Attention
    Continue working
    Start new workflow
    Recent activity
Footer / supporting navigation
```

Section labels should be meaningful.

Avoid multiple generic regions named:

```text
Section
Section
Section
```

---

# 33. Accessible Status

Important status must not rely only on visual styling.

For example:

```text
CONFIRMED
PROACTIVE
UNCLASSIFIED
```

must remain understandable without color.

Likewise:

```text
Reply received
Campaign paused
Send failed
Research complete
```

must communicate their meaning through text and accessible semantics.

W3C recommends that color not be the sole method of conveying information. ([W3C][1])

---

# 34. Loading Behavior

Home may require several sources of information.

The interface should avoid an all-or-nothing loading screen when independent sections can load safely.

Example:

```text
Your workspace

Needs your attention
[loaded]

Continue working
[loading]

Recent activity
[loaded]
```

A section-level failure should not unnecessarily destroy the entire workspace.

---

# 35. Data Freshness

Workspace information should communicate freshness where stale information could affect the user's decision.

Examples:

```text
Reply received just now
```

or:

```text
Last updated 5 minutes ago
```

Do not create constant live-refresh behavior merely for visual activity.

Refresh should support actual operational needs.

---

# 36. Refresh Behavior

If workspace information becomes stale:

```text
New activity available

[Refresh]
```

may be preferable to silently moving content underneath the user's focus.

Unexpected movement can be disorienting.

When new information affects an active task, preserve user input and context.

---

# 37. AI on Home

AI may assist with:

* summarizing active work
* explaining why an item requires attention
* suggesting the next documented workflow action

AI must not silently:

* send outreach
* change campaign state
* change opportunity state
* select a contact
* approve outreach
* dismiss important attention items
* infer a career outcome as fact

Any AI-generated interpretation must remain distinguishable from authoritative system state.

---

# 38. "Next Action" Integrity

If Home displays:

```text
Next:
Review outreach
```

that recommendation must correspond to the actual workflow state.

The UI must not recommend an action that is:

* already completed
* unavailable
* blocked by missing information
* prohibited by another state
* inconsistent with the domain experience

Home is an aggregator of workflow state.

It must not invent workflow transitions.

---

# 39. Cross-Experience Continuity

Home must preserve the relationship between:

```text
Company
→ Opportunity
→ Contact
→ Evidence
→ Outreach
→ Campaign
→ Reply
→ Outcome
```

When a user enters a workflow from Home, the destination should retain enough context to make the transition feel continuous.

For example:

```text
Home
"Reply received from Example Company"
        ↓
Conversation
        ↓
Example Company
        ↓
Opportunity context
        ↓
Original outreach
```

The user should not need to rediscover the company or opportunity.

---

# 40. Recent Activity vs Attention

These are different concepts.

### Attention

Means:

```text
Something requires or benefits from action now.
```

### Recent activity

Means:

```text
Something happened recently.
```

An event can appear in Recent Activity without requiring action.

Example:

```text
Campaign scheduled
```

does not necessarily require immediate action.

A reply may appear in both:

```text
Attention:
Reply received — needs response

Recent activity:
Reply received from Sarah Johnson
```

The representations must not contradict each other.

---

# 41. No Duplicate Noise

The workspace should avoid showing the same event repeatedly in slightly different cards.

For example, do not present:

```text
3 replies
```

then:

```text
Reply received
```

then:

```text
New conversation
```

for the same underlying event without a clear reason.

Home should reduce cognitive load, not multiply it.

---

# 42. Notification Boundaries

Home should not become a notification center containing every system event.

Only surface events that contribute to:

* action
* continuation
* orientation
* meaningful recent activity

Low-value technical events belong elsewhere.

---

# 43. Error Safety

Home must not expose implementation details.

Do not surface:

```text
PrismaClientKnownRequestError
PostgreSQL connection refused
HTTP 502 from provider X
```

unless explicitly transformed into safe user-facing language.

Prefer:

```text
We couldn't load recent activity.

[Retry]
```

Technical diagnostics remain server-side.

---

# 44. Privacy and Context

Home may contain sensitive professional information.

The interface should avoid unnecessarily exposing:

* full email addresses
* private contact details
* message bodies
* provider credentials
* sensitive configuration

in summary surfaces when a less revealing representation is sufficient.

For example:

```text
Reply received from Sarah Johnson
```

is preferable to displaying the complete email body on Home.

---

# 45. Workspace Personalization

Personalization should remain subordinate to workflow clarity.

Potential personalization:

```text
Good morning, Pondei
```

is acceptable.

But personalization must not create:

```text
AI-generated motivational messages
career predictions
success scores
```

that distract from actual work.

---

# 46. Workspace Completion State

There is no need to manufacture a "completed" Home state.

If the user has no active work:

```text
You're caught up

No active work currently requires attention.

[Add company]
```

This should feel calm rather than empty.

Do not fill the space with artificial recommendations merely to avoid whitespace.

---

# 47. Accessibility Acceptance Checklist

### Structure

* [ ] Home has one clear primary heading.
* [ ] Main content has meaningful semantic structure.
* [ ] Major workspace regions are identifiable.
* [ ] Current navigation location is clear.
* [ ] Repeated navigation is consistent.

### Keyboard

* [ ] Primary workflow is fully keyboard accessible.
* [ ] Navigation is keyboard accessible.
* [ ] Attention items are keyboard accessible.
* [ ] Focus order follows task hierarchy.
* [ ] Focus is visible.
* [ ] Focus is not hidden by fixed UI.
* [ ] No keyboard traps exist.
* [ ] Dialog/drawer focus behavior is correct.

### Responsive

* [ ] Wide layout works.
* [ ] Medium layout works.
* [ ] Compact layout works.
* [ ] Primary action remains accessible.
* [ ] Attention remains prominent.
* [ ] Active workflow remains understandable.
* [ ] No critical information disappears at compact widths.
* [ ] Long company/contact names do not break the layout.

### State

* [ ] Loading states are understandable.
* [ ] Partial failures are handled.
* [ ] Complete failure is recoverable.
* [ ] Empty workspace is actionable.
* [ ] Active work has meaningful next actions.
* [ ] Activity does not masquerade as attention.

### Accessibility

* [ ] Color is not the sole state indicator.
* [ ] Interactive controls have accessible names.
* [ ] Status changes are appropriately communicated.
* [ ] Text remains usable when enlarged.
* [ ] Content reflows appropriately.
* [ ] Touch targets are usable.
* [ ] Reduced-motion behavior has been considered.

---

# 48. Experience Integrity Invariants

### INVARIANT-01

Home is an orientation and continuation surface, not a generic analytics dashboard.

### INVARIANT-02

The company-first workflow remains the primary mental model.

### INVARIANT-03

Home must not invent business states that do not exist in the domain model.

### INVARIANT-04

A displayed "next action" must correspond to the authoritative workflow state.

### INVARIANT-05

Home must distinguish required attention from merely recent activity.

### INVARIANT-06

Home must not imply career outcomes that the system has not established.

### INVARIANT-07

Home must not represent an email as sent unless the authoritative send state confirms it.

### INVARIANT-08

Home must not imply that a reply means an interview, referral, offer, or other career outcome.

### INVARIANT-09

Opportunity states must preserve their authoritative meanings.

### INVARIANT-10

Responsive transformations must preserve workflow meaning and context.

### INVARIANT-11

Important states must not depend on color alone.

### INVARIANT-12

The user must be able to continue active work without reconstructing context manually.

### INVARIANT-13

Partial data failure must not unnecessarily erase usable workspace information.

### INVARIANT-14

AI-generated interpretation must not replace authoritative system state.

### INVARIANT-15

Home must not become a generic CRM, inbox, analytics dashboard, or notification dump.

### INVARIANT-16

The workspace must never manufacture activity solely to make the interface appear populated.

---

# 49. Cross-Experience Ownership

This document owns:

* Home composition
* workspace orientation
* attention aggregation
* active-work continuation
* recent activity summary
* workspace empty states
* workspace loading/failure states
* Home-level responsive composition
* Home-level accessibility behavior

Individual experience contracts own the underlying domain behavior.

### Company

`02-company.md` owns company workflow and company-level actions.

### Research

`03-research.md` owns research interpretation and evidence.

### Contacts

`04-contacts.md` owns contact discovery and selection.

### Opportunity

`05-opportunity.md` owns opportunity state.

### Outreach

`06-outreach.md` owns outreach creation, editing, and approval.

### Campaign

`07-campaign.md` owns campaign scheduling, sending, recipient progression, and follow-up behavior.

### Email Replies

`08-email-replies.md` owns conversation and reply handling.

### Responsive & Accessibility

`09-responsive-accessibility.md` owns cross-product responsive and accessibility requirements.

Home aggregates these experiences.

It does not redefine them.

---

# 50. Definition of Done

Home / Workspace is complete only when:

1. The user can immediately identify the workspace.
2. The primary action is clear.
3. Work requiring attention is visible.
4. Active work can be resumed.
5. Recent activity provides useful orientation.
6. Empty workspace state provides a clear starting point.
7. Home reflects authoritative domain states.
8. Home does not invent career outcomes.
9. Company context remains connected to downstream workflow.
10. Partial failures are handled without unnecessary blank states.
11. The experience works across wide, medium, and compact layouts.
12. The complete experience is keyboard accessible.
13. Focus behavior is correct.
14. Important state is not communicated by color alone.
15. Long content does not break the layout.
16. Home does not become a generic analytics dashboard or notification feed.
17. Visual review confirms that attention and active work dominate secondary information.
18. Functional review confirms that displayed actions correspond to real workflow state.
19. Accessibility review confirms the applicable WCAG 2.2 AA requirements have been addressed.

---

# 51. Final Experience Standard

**Home should make the next meaningful action obvious without pretending to know more than the system actually knows.**

The user should open Outreacher and quickly understand:

```text
What needs my attention?
        ↓
What am I currently working on?
        ↓
Where did I leave off?
        ↓
What can I continue?
        ↓
What should I do next?
```

The workspace succeeds when it reduces the distance between:

```text
"I opened Outreacher."
```

and:

```text
"I know exactly what I can do next."
```

without turning the product into a dashboard of invented scores, metrics, predictions, or activity.

```

The accessibility requirements are aligned with W3C's WCAG 2.2 framework, particularly its principles around perceivability, keyboard operation, navigation/orientation, predictable interaction, and responsive/reflow behavior. :contentReference[oaicite:5]{index=5} 
```

[1]: https://www.w3.org/WAI/fundamentals/accessibility-principles/?utm_source=chatgpt.com "Accessibility Principles | Web Accessibility Initiative (WAI) | W3C"
[2]: https://www.w3.org/WAI/WCAG21/Understanding/consistent-navigation?utm_source=chatgpt.com "Understanding Success Criterion 3.2.3: Consistent Navigation | WAI | W3C"
[3]: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/?utm_source=chatgpt.com "What's New in WCAG 2.2 | Web Accessibility Initiative (WAI) | W3C"
