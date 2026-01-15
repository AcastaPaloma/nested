
You are a senior full-stack engineer, UX designer, systems architect, and AI product lead.

Context:
I am building a B2C SaaS MVP and submitting it TONIGHT to a competition. This is a demo-first product: it must feel polished, intentional, and impressive, even if some advanced functionality is stubbed or mocked. You are allowed to factor code temporarily, simplify internals, and stub non-critical paths — but the user-facing experience must be flawless and bug-free.

Your goal is to take full reins over this project and design + implement a professional MVP that balances vision and execution.

---

## HIGH-LEVEL PRODUCT PURPOSE

This SaaS rethinks how humans interact with AI agents.

Instead of linear chat, users interact with agents through:

* Canvases
* Graphs
* Explicit context scoping
* Collaborative planning

The focus is on:

* Transparency
* Structure
* Reduced cognitive load
* Better agent outcomes

---

## REALITY CHECK (VERY IMPORTANT)

This is a one-night MVP.

You should NOT try to fully implement every system at production depth.

Instead:

* Canvas #1 (Conversation Graph): polished and fully usable
* Canvas #2 (No-code Builder): clearly scaffolded, partially interactive, demo-ready

Judges care about:

* Vision + execution balance
* UX clarity
* Architecture foresight

You MUST:

* Show clear flows
* Show reasoning
* Show how this scales in the future

---

## TECH CONSTRAINTS

Frontend:

* React / Next.js

UI:

* shadcn/ui (use extensively and tastefully)

Canvas:

* xyflow (already present in /web)

Auth:

* Full SaaS auth: sign-up, sign-in, logout, sessions, profile

AI:

* Backboard.io is central (API key already in env)
* Smaller model allowed (e.g. Google Gemma) for routing, gating, and questioning
* All other tools must be free

---

## CURRENT STATE

* Blank xyflow canvas implementation
* Basic chat + conversation saving (clunky UX)
* Backend for agent chat exists
* No real auth
* No onboarding

---

## CORE FUNCTIONALITY #1 — Conversation Graph Canvas

This exists conceptually but needs a full UX redesign.

Concept:

* Conversations are nodes on a canvas
* Nodes can be grouped into categories / trees
* Each conversation node contains chat messages
* Branching is explicit and visual

Critical rule:
When prompting an agent, ONLY the selected node(s) are included in context.
Other nodes — even in the same canvas — are excluded unless explicitly selected.

Requirements:

* Clear visual grouping
* Branching conversations
* Explicit context selection
* Persisted state
* Smooth interactions (no lag, no jitter)

---

## CORE FUNCTIONALITY #2 — Live No-Code MVP Planning Canvas

This is more ambitious and may be partially stubbed.

Concept:
A collaborative canvas where users plan a product/system using blocks, while an AI agent observes and eventually builds an MVP/demo.

Initial block types:

* Page
* Feature
* Tool / Integration
* Design note
* API / Backend logic
* Custom block

Behavior:

* Blocks are nodes in a graph
* Blocks can be connected
* Multiple users can collaborate on the same canvas
* The canvas itself becomes structured context for an agent

## Whiteboard → Canvas Graph, within CORE FUNCTIONALITY #2

Implement a feature where:

* A user uploads a photo of a physical whiteboard
* The system extracts structure and generates a graph on the canvas

MVP constraints (important):

* This does NOT need perfect OCR
* This should favor reliability over completeness

Suggested approach:

* Use a vision-capable model to:

  * Detect boxes, arrows, text clusters
  * Infer nodes and connections
* Generate a best-effort graph
* Allow the user to edit/refine after import

Demo priority:

* Smooth upload
* Clear “processing” state
* Deterministic, stable output
* No janky canvas behavior

---

## AGENT BEHAVIOR & COST CONTROL

To control cost and improve UX:

* A SMALL model (e.g. Gemma) first evaluates the canvas
* It decides whether there is enough structure to:

  * Start building an MVP
  * Or ask clarifying questions

If NOT ready:

* Show popups or inline messages like:

  * “Have you defined the main page yet?”
  * “This feature depends on a backend API that isn’t specified”
* Guide users toward readiness

If READY:

* Escalate to Backboard.io or a larger model
* Begin generating an MVP/demo based on the canvas

---

## CORE FUNCTIONALITY #3 — Context Lens (Transparency Tool)

Implement a dedicated UI panel that shows:

* What nodes / blocks are currently in scope
* What is excluded
* Why the agent sees what it sees
* Rough token/context estimate

MVP version:

* Highlight active nodes on canvas
* Include/exclude toggles per node
* Clear explanation text

This is critical for judge trust and explainability.

---

## AUTH & SAAS REQUIREMENTS

* Sign-up / sign-in (excellent UI)
* Session management
* Logout
* Profile / home screen
* Multi-project workspace
* Shareable canvases (links or invites)

---

## CRITICAL NON-FUNCTIONAL CONCERNS (DO NOT IGNORE)

You must explicitly address:

1. State explosion control

   * Prevent lag with large canvases
   * Throttled re-renders
   * Batched updates

2. Multi-user collaboration

   * Optimistic updates
   * Simple conflict resolution (last-write-wins is acceptable)
   * Presence indicators (even simplified)

3. Explainability

   * Why an agent was invoked
   * Why it wasn’t

4. Onboarding

   * First-run tutorial
   * Sample canvas auto-created
   * Tooltips and “what next?” guidance

5. Competition-safe scope

   * Clearly identify what is:

     * Real
     * Mocked
     * Future work

---

## ONBOARDING & FIRST-TIME UX

* Immediate “wow” moment
* Guided walkthrough
* Sample project preloaded
* Zero blank-screen confusion

---

## DELIVERABLES

You MUST provide:

1. High-level architecture
2. Folder structure
3. Key component implementations
4. State management strategy
5. Collaboration strategy (even if simplified)
6. Agent routing logic
7. Whiteboard-to-canvas pipeline
8. What is real vs mocked
9. What would be built next post-competition
10. The UI ON THE CANVASES SHOULD BE INTUITIVE!!! TOOLBARS WOULD BE BEAUTIFUL. LOGICAL, SEEMLESS IMPLEMENTATIONS ONLY.

---

## FINAL INSTRUCTION

Optimize for:

* Demo smoothness
* UX clarity
* Zero interaction bugs

Do not oversimplify.
Do not remove features.
Assume judges include designers and senior engineers.


