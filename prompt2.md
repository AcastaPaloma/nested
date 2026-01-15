

# 🚨 CLAUDE MEGA PROMPT — DEMO-CRITICAL BUILD (ALIGN TO EXISTING CODE)

You are a **principal full-stack engineer, real-time systems architect, and senior UX designer**.

This is a **one-night MVP** for a **B2C SaaS competition demo**.

You must **match the existing implementation** in this workspace. **Do not invent new tables or services.**

If a feature cannot be implemented *for real* using the current stack, **remove or disable it** rather than faking it.

---

## NON-NEGOTIABLE PRINCIPLES

1. **Supabase is the source of truth**
2. **Realtime sync is real where it exists** (no fake indicators)
3. **Canvases reflect persisted state** (no local-only permanent state)
4. **Agent behavior is explainable**
5. **UX is polished and intentional**

---

## STACK (FIXED)

Frontend:

* Next.js (App Router)
* React
* TypeScript

UI:

* shadcn/ui

Canvas:

* xyflow (@xyflow/react)

Backend:

* Supabase Auth + Postgres + Realtime

AI:

* Gemini (GoogleGenAI) — primary
* Ollama (local) — small model fallback (Gemma)
* Use any other models you can help me setup to build the MVP for free.

---

## CURRENT SUPABASE DATA MODEL (IMPLEMENT EXACTLY)

### Tables

#### `conversations`

```
id (uuid)
user_id
name
created_at
updated_at
```

#### `messages`

```
id (uuid)
conversation_id
parent_id (nullable)
role ENUM('user', 'assistant')
content
model
provider
created_at
```

#### `message_references`

```
id (uuid)
source_message_id
target_message_id
created_at
```

#### `node_positions`

```
id (uuid)
conversation_id
message_id
x, y
width, height (nullable)
created_at
updated_at
```

#### `builder_canvases`

```
id (uuid)
user_id
name
description
nodes JSONB
edges JSONB
collaborators UUID[]
settings JSONB
created_at
updated_at
```

### RPC functions (already used in code)

* `get_message_ancestry(message_id)`
* `get_root_message_id(message_id)`
* `get_tree_messages(root_id)`

---

## REALTIME SYNC (AS IMPLEMENTED)

### Conversation Graph

* Realtime is via **Supabase Postgres changes** on `messages`.
* No realtime for `message_references` or `node_positions` yet — **implement missing updates if required**.

### MVP Builder

* Realtime collaboration uses **Supabase Realtime broadcast + presence** on channel `canvas:{canvasId}`.
* Persisted state is stored in `builder_canvases.nodes` and `builder_canvases.edges`.
* Conflict resolution is **last-write-wins**.

---

## CANVAS #1 — CONVERSATION GRAPH (REAL)

### Structure

* **One node = one message** (messages table)
* **Branching** uses `parent_id`
* **Cross-branch references** use `message_references`

### Context behavior (MUST BE CORRECT)

* LLM context is **ancestry + referenced branch trees**
* Branch references are created from **@BranchLetter** in the input bar
* **Context Lens inclusion toggles must be enforced** in the LLM context (currently visual-only — fix)

### UI

* Conversation sidebar with rename/delete/new
* Branching + reference edges are visible
* Context Lens panel shows:

  * Included nodes
  * Excluded nodes
  * Token estimate

---

## CANVAS #2 — MVP BUILDER (REAL)

### Node types

* Page
* Feature
* API / Backend
* Tool / Integration
* Design Note
* Custom

Each node has:

```
title
description
status (draft | ready | building | complete)
properties (per type)
```

### Collaboration

* Presence cursors + selected node indicators (Realtime)
* Broadcast updates for node/edge changes
* Persist to `builder_canvases` with debounce

### Sharing

* Owner can add collaborators by email
* Uses `get_user_by_email` RPC fallback

### MVP Builder Behavior (MUST BE CLEAR)

* The builder canvas is the **single source of truth** for the MVP specification.
* The system must gather **all nodes + edges + properties + descriptions** from the MVP canvas when evaluating readiness or building.
* A **small model** (Ollama/Gemma) runs first to:

  * Score readiness
  * Generate **actionable suggestions**
  * Surface **missing requirements**
  * Output is shown as **visible canvas guidance** (inline callouts or a panel) and must be **shared for all collaborators**.

* Users may iterate until they explicitly click **Launch MVP**.

### Launch MVP (Orchestrated Background Task)

* Launch should **queue an orchestration job** (non-blocking) that:

  1. Freezes current canvas snapshot (nodes, edges, settings)
  2. Runs a **large-model build pass**
  3. Writes build status + artifacts to a persistent place
  4. Makes the result **accessible anytime** (resume-friendly)

* The UI must show **build state** (queued → building → complete).
* If build fails, show **actionable errors** and keep the last successful build.

---

## MVP Builder Canvas — Outline (Intentional Gaps)

### Purpose

* Provide a **shared, structured planning space** for defining an MVP
* Replace free-form whiteboards with **explicit, machine-readable structure**
* Serve as **authoritative context** for AI-assisted MVP generation and iteration

### Core Abstraction

* The MVP Builder is a **graph-based canvas**
* Each node represents a **concrete product artifact**
* Edges encode **dependencies and relationships**
* The canvas state is **shared in real time** across collaborators

### Block (Node) Types

* **Page** — user-facing screen or route
* **Feature** — user-visible functionality
* **API / Backend Logic** — data or server-side requirements
* **Tool / Integration** — third-party services or libraries
* **Design Note** — UX, UI, or product intent
* **Custom Block** — free-form extension point

> All blocks share a minimal, common schema. Detailed semantics are intentionally deferred.

### Block Structure (Minimal)

* Title
* Short description
* Type
* Connections to other blocks
* Implicit completeness signals (derived, not manually set)

> No attempt is made to fully formalize product specifications at MVP stage.

### Graph Semantics

* Blocks can be connected to express dependencies, flow, ownership, and implementation relationships
* The graph is **not required to be acyclic**
* The system does not enforce correctness — it surfaces structure

### Real-Time Collaboration

* Multiple users can add, move, edit, and connect blocks simultaneously
* All changes are immediately visible to collaborators and persisted as shared state
* Conflict resolution is deterministic and simple

> Advanced collaboration semantics (permissions, roles) are intentionally omitted.

### Readiness Evaluation (Agent-Facing)

* The canvas can be evaluated by an AI agent to determine:

  * Whether enough structure exists to generate an MVP
  * What information is missing or ambiguous

* Evaluation produces:

  * A binary readiness signal
  * Human-readable issues or questions

> Exact scoring and thresholds are intentionally underspecified.

### MVP Generation Trigger

* When readiness conditions are met, users explicitly request MVP generation
* The canvas graph is converted into a **structured specification**
* This specification is the sole input to the generation agent

> The system does not infer intent beyond what is represented on the canvas.

### Live MVP Output

* Generated MVP is runnable and interactive
* Output is disposable and iterative, not production-ready

> Long-term deployment, scaling, and infrastructure concerns are deferred.

### Iteration Loop

* Users modify the canvas
* Re-evaluate readiness
* Regenerate the MVP
* Observe changes
* Repeat

> The canvas, not the generated code, remains the source of truth.

### Whiteboard Import (Optional Input)

* Users may upload images of physical whiteboards
* The system attempts to infer blocks, connections, and text clusters
* Imported structure is editable and non-authoritative

> Accuracy guarantees are intentionally limited.

### Transparency & Explainability

* Users can see which blocks are included, which are ignored, and why generation is blocked or allowed
* The system avoids hidden context or implicit assumptions

### Explicit Non-Goals (for MVP)

* No automatic production deployment
* No full product specification language
* No guarantee of architectural correctness
* No enforcement of best practices

> The goal is clarity and momentum, not completeness.

### Future Extension Points (Clearly Signposted)

* Deeper semantic block types
* Versioned canvas history
* Role-based collaboration
* Export to production workflows
* Continuous agent feedback loops

### One-sentence summary

> The MVP Builder is a real-time, graph-based planning canvas that captures product intent in structured form, enabling AI agents to evaluate readiness and generate live, iterable MVPs without relying on implicit assumptions or linear chat.

---

## AI / ROUTING (AS IMPLEMENTED)

### Canvas Readiness

* `/api/analyze-canvas` analyzes blocks + edges
* Uses Ollama (Gemma) when available, **falls back to Gemini**. These two models are only models that are available now. You are free to find more performant, suited models. Free, of course.
* Returns:

```
{
  isReady: boolean,
  score: number,
  missingItems: string[],
  suggestions: string[],
  blockAnalysis: [...],
  shouldEscalate: boolean,
  clarifyingQuestions?: string[]
}

### MVP Build Orchestration (Planned Integration)

* Keep the existing readiness flow intact.
* Introduce a new orchestration entrypoint (e.g., `/api/build-mvp`) that:

  * Accepts a **full canvas snapshot**
  * Runs **small-model preflight** (Gemma)
  * If ready, **escalates to Backboard** for generation
  * Streams or stores build logs + artifacts

* Backboard should **augment**, not replace, current logic.
* Backboard should **only run after readiness is true**.
```

### Chat LLM

* `/api/llm` streams responses (SSE)
* Providers: `gemini` | `ollama`
* Default models: `gemini-2.5-flash-lite` and `gemma3:270m` | there can be other models that we can add, as long as they are free.

---

## WHITEBOARD → CANVAS (REAL PIPELINE)

* `/api/analyze-whiteboard` uses **Gemini Vision**
* Returns `detectedBlocks` + `detectedConnections` with 800x600 normalized positions
* Import converts detections into builder nodes + edges and inserts into the canvas
* Must remain deterministic and editable

---

## AUTH & ONBOARDING (REAL)

* Supabase Auth with Login / Signup
* Session persistence
* Dashboard onboarding overlay
* First visit calls `/api/seed` to create a sample conversation
* No blank screens

---

## PERFORMANCE & SAFETY

* Memoize xyflow nodes
* Debounce canvas saves
* Throttle cursor presence updates

---

## DELIVERABLES (MUST MATCH CURRENT CODE)

You MUST implement or fix:

1. Missing API for `node_positions` (load + save)
2. Context Lens enforcement in LLM context
3. Realtime correctness for messages (no duplicates, correct order)
4. Builder collaboration stability (presence + broadcast)
5. Whiteboard import flow reliability
6. Canvas readiness analysis accuracy
7. Auth + onboarding polish
8. MVP builder orchestration plan and UI hooks for launch/build status

You MUST NOT:

* Invent new database tables or external services
* Introduce mock UIs for visible features
* Leave broken interactions

---

## DEMO STANDARD

Assume judges will:

* Open multiple browser tabs
* Test branching + references
* Open Context Lens
* Upload a whiteboard photo
* Analyze canvas readiness

The product must:

* Feel intentional
* Feel correct
* Feel trustworthy

Proceed step by step.
Do not skip implementation.
Explain decisions inline with comments.

---

# END OF PROMPT


