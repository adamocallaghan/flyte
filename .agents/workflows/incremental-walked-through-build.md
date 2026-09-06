---
description: Incremental Walked-Through Build
---

## The core rule
 
**After completing one step (see "Step granularity" below), stop.** Do not continue to the next step, and do not commit, until the person has responded. Concretely, for each step:
 
1. Write only the code for that step — nothing ahead of it, even if the next step seems obvious or trivial.
2. Summarize in plain language: what was added, why it's shaped this way, and anything non-obvious (a design choice, a trade-off, an open question carried over from `docs/interface-notes.md`).
3. Show the diff.
4. **Wait.** Do not stage or commit anything until the person explicitly confirms (e.g. "commit that," "looks good," "go ahead"). If they ask a question or request a change instead, address that before asking again — don't treat a question as implicit approval.
5. Once confirmed, commit **only what was covered in that step** — no bundling in unrelated cleanup, no "while I was in there" additions. If something adjacent needs fixing, mention it and let the person decide whether it's a separate step.
If a step turns out to be bigger than expected once you're inside it, stop early at a sensible sub-point and say so, rather than pushing through to the originally-planned stopping point. Smaller, more frequent check-ins are always preferred over fewer, larger ones.
 
## Commit message convention
 
Use [Conventional Commits](https://www.conventionalcommits.org/)-style prefixes so the eventual git log itself reads as a legible build narrative for judges reviewing history:
 
- `feat(perp): add constructor and state variables`
- `feat(perp): add openPosition against dummy oracle/aqua`
- `test(perp): happy path open`
- `chore(perp): scaffold function stubs`
- `refactor(perp): swap dummy Aqua interface for real ship/pull calls`
- `docs: interface notes from Phase 0 audit`
Keep the scope (`perp`, `amm`, `subgraph`, etc.) consistent per contract/module so the history is filterable later.
 
## Step granularity
 
A "step" is roughly one commit. As a default template per contract (adjust per the specific PRD phase, but don't collapse steps together without asking):
 
1. **Skeleton** — file, license header, pragma, imports (placeholder/commented if not yet needed), bare contract declaration. No logic.
2. **State** — structs, storage variables, constants, events. No logic yet, just the data shape — this is a good early checkpoint since it's cheap to change before anything is built on top of it.
3. **Constructor + access control scaffolding** — owner/admin pattern, address setters. Still no trading logic.
4. **Function stubs** — every external/public function signature the contract will need, each reverting with `"not implemented"` or similar. Walk through this one carefully together: it's the whole public interface laid out before any logic exists, and the cheapest point to catch a missing or wrongly-shaped function.
5. **Pure/view helper functions** — margin math, funding math, oracle-read wrapper. Independently reasoned about and testable before being wired into state-changing flows.
6. **One state-changing function (or tightly related pair) per commit** — e.g. `openPosition`, then `closePosition`, then `settleFunding` (including the funding-default path), then `liquidate` (including the funding-default trigger path). Each wired against **dummy** oracle/Aqua interfaces at this stage, not the real ones yet.
7. **Swap dummies for real interfaces** — one commit for the real Aqua `ship`/`pull`/`push` calls replacing the dummy, one commit for the real oracle interface wiring (this is about the *interface*, not replacing `MockPriceOracle` itself, which the PRD deliberately keeps for demo determinism).
8. **Deployment/fork script** — one commit, run against the Arbitrum fork with real confirmed addresses.
9. **SwapVM opcode integration** — one commit per opcode, replacing the plain-Solidity math written in step 5.
**Tests mirror this same granularity, one behavior per commit**, built alongside or immediately after the corresponding implementation step (see PRD Section 7 for the required scenario list) — not batched into one test file at the end.
 
## What "stopping" does NOT mean
 
- It doesn't mean asking permission for trivial within-step choices (variable naming, comment wording) — use judgment there.
- It doesn't mean re-explaining the whole PRD at every step — assume prior context carries forward within a session.
- It doesn't mean the person needs to write or review code line-by-line themselves — the summary-and-diff format is meant to make review fast, not to shift the work back to them.
## Applying this to Phase 0 (interface audit) specifically
 
Phase 0 produces `docs/interface-notes.md` rather than contract code, but the same stop-and-confirm rule applies: don't silently resolve an open `[CONFIRM]` item from the PRD and move on — surface what was found, note anything that changes a downstream contract's planned shape, and get a nod before writing `interface-notes.md` as final.