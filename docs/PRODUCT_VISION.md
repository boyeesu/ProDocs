# Product vision

## The problem

Important software knowledge is fragmented across code, tickets, wikis,
architecture diagrams, chat, and individual memory. The code changes
continuously; the surrounding explanation does not. Teams then choose between
stale documentation and repeatedly reverse-engineering the system.

Coding agents make the gap more expensive. They can read enormous amounts of
text, but more context is not the same as correct context. An agent needs to
know:

- what the product is intended to do;
- how the relevant part of the system works now;
- which constraints and decisions are intentional;
- what is likely to break if a change is made;
- which documentation must change with the code.

## Product thesis

**Code is evidence. Documentation is a set of claims. ProDocs keeps the link
between them.**

The source repository remains the durable home of technical knowledge. ProDocs
builds a versioned knowledge graph from source evidence and combines it with
human-authored intent. Every output—human or agent-facing—is a projection of
that model.

ProDocs is not primarily a static-site generator, code summarizer, or AI writer.
Those can be replaceable views and capabilities around the graph.

## Users and jobs

### Engineer entering an unfamiliar area

“Show me how this capability works, where it starts, what it depends on, and the
decisions I must not accidentally reverse.”

### Maintainer reviewing a change

“Show me the behavioral and documentation impact of this diff, including
affected runbooks, decisions, APIs, and owners.”

### Product or support teammate

“Explain what the product does in language suited to me, while keeping technical
claims traceable.”

### Coding agent

“Give me the smallest sufficient, current context for this task and tell me what
knowledge must be refreshed when I finish.”

### Open-source adopter

“Let me run the useful core locally, inspect its model, extend it without
permission, and avoid sending my repository to a vendor.”

## The knowledge model

ProDocs separates four concepts that conventional documentation mixes together:

1. **Evidence** — source files, symbols, tests, APIs, schemas, configuration,
   ownership, commits, and runtime signals.
2. **Claims** — assertions such as “the API retries failed deliveries three
   times.” A claim records supporting evidence, confidence, scope, and freshness.
3. **Intent** — product goals, architectural decisions, invariants, policies,
   tradeoffs, and operational expectations. Intent is explicitly authored and
   reviewed by people.
4. **Views** — system overviews, onboarding guides, product explanations,
   runbooks, diagrams, PR impact reports, and agent context packets.

This division allows generated facts to change without overwriting product
intent, and it makes unsupported AI prose visible rather than authoritative.

## The “mindblowing” interaction

A developer opens a pull request and ProDocs says:

> This change moves token validation behind the gateway. It affects two public
> API paths, one runbook, the authentication decision record, and three tests.
> Two documented claims are now unsupported. Here is a proposed documentation
> patch, with every sentence linked to evidence.

An agent working on the same change asks for context and receives only:

- the entrypoint and dependency slice involved;
- the applicable decisions and invariants;
- current public behavior and tests;
- owners and risk boundaries;
- the required post-change documentation checks.

That is more useful than “chat with your docs.” It is a reviewable knowledge
system woven into software delivery.

## Product principles

1. **Local-first and repository-native.** Useful without a hosted service.
2. **Deterministic core, optional intelligence.** Indexing, provenance, drift,
   and queries must work without an LLM.
3. **Evidence before eloquence.** Unsupported prose is clearly labeled.
4. **Human intent is protected.** Models propose changes; review accepts them.
5. **Agent-neutral protocol.** Versioned JSON, CLI, and MCP before bespoke
   dependencies on any one coding agent.
6. **Incremental by default.** Large repositories should update from diffs, not
   be fully reprocessed on every change.
7. **Extensible through stable seams.** Language analyzers, evidence sources,
   renderers, policies, and model providers are plugins.
8. **Git is the audit log.** Knowledge changes review and time-travel with code.

## Strategic moat

The defensible asset is not generated Markdown. It is the longitudinal,
evidence-backed graph of how a product behaves, why it was designed that way,
and how those facts evolve across commits. The richer that model becomes, the
better it can serve both people and agents without locking either into a single
interface.

## What ProDocs will not become

- A model that rewrites the entire documentation set on every run.
- A hosted wiki that moves the source of truth away from the repository.
- A pile of vendor-specific instruction files with no shared context model.
- A system that presents inferred prose as fact without provenance.
- A replacement for deliberate product thinking or architectural decisions.

## Success measures

Early product validation should track:

- time for a new engineer or agent to make a correct first change;
- percentage of generated claims with direct evidence;
- stale-claim detection precision;
- documentation updates accepted from change-impact suggestions;
- context tokens used per successful agent task;
- indexing and incremental update time on large repositories;
- number of useful integrations built without changes to the core.
