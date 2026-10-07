#!/usr/bin/env node
// Creates demo/Atlas: a fictional product's docs & planning folder, used for
// README screenshots. Everything here is made up.
//
//   npm run demo
//   bin/markedit-explorer open-folder demo/Atlas
//   open -a MarkEdit "demo/Atlas/planning/2026/launch-plan.md"

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'Atlas');

const note = (title, body) => `# ${title}\n\n${body.trim()}\n`;

const LAUNCH_PLAN = `---
title: Atlas 2.0 Launch Plan
owner: Dorkusprime
status: In review
updated: 2026-10-02
tags: [launch, q4, roadmap]
---

# Atlas 2.0 Launch Plan

> [!NOTE]
> This plan covers the **public launch** of Atlas 2.0 on *November 18*. Internal
> beta details live in [the Q4 roadmap](q4-roadmap.md); open questions are tracked
> at the [end of this document](#open-questions).

## Summary

Atlas 2.0 replaces the nightly batch importer with **live sync**, ships the new
plugin system from [RFC 0001](../rfcs/0001-plugin-system.md), and cuts median
search latency from ~420 ms to under 120 ms[^bench]. We're launching to all
workspaces at once, behind a server-side flag we can roll back in minutes.

![Atlas 2.0 architecture](../../assets/diagrams/architecture.svg)

## Goals

1. **Adoption:** 40% of active workspaces enable live sync within 30 days.
2. **Reliability:** sync error rate stays below 0.1% of operations.
3. **Performance:** p95 search latency under 250 ms on workspaces with 1M+ docs.
4. **Ecosystem:** at least 10 third-party plugins published by launch day.

### Non-goals

- Mobile apps (tracked separately for Q1)
- ~~Self-hosted connectors~~ — moved to [RFC 0002](../rfcs/0002-offline-sync.md)
- Billing changes

## Timeline

| Milestone           | Date       | Owner        | Status        |
| :------------------ | :--------- | :----------- | :------------ |
| Feature freeze      | 2026-10-20 | Engineering  | ✅ On track   |
| Private beta (50)   | 2026-10-27 | Product      | ✅ On track   |
| Docs & guides final | 2026-11-06 | Docs         | ⚠️ At risk    |
| Press briefing      | 2026-11-12 | Marketing    | 🕓 Scheduled  |
| **Public launch**   | 2026-11-18 | Everyone     | 🚀            |

\`\`\`mermaid
gantt
    title Atlas 2.0
    dateFormat YYYY-MM-DD
    section Build
    Feature freeze        :done,   2026-10-01, 2026-10-20
    Hardening             :active, 2026-10-20, 2026-11-10
    section Launch
    Private beta          :        2026-10-27, 2026-11-14
    Public launch         :milestone, 2026-11-18, 0d
\`\`\`

## Launch checklist

- [x] Load test sync service at 3× expected peak
- [x] Security review of the plugin sandbox
- [ ] Migration guide reviewed by support ([draft](../../docs/guides/migrating-from-v1.md))
- [ ] Status page components for *Sync* and *Plugins*
- [ ] Rollback drill with on-call
  - [x] Flag flip under 5 minutes
  - [ ] Data reconciliation script dry run

## Rollout

We ramp by workspace size so small teams find issues before large ones do:

1. **Day 0:** workspaces under 50 seats (≈ 70% of accounts, 15% of load)
2. **Day 2:** up to 500 seats
3. **Day 5:** everyone, including enterprise

The ramp is controlled by a single flag:

\`\`\`yaml
# config/flags/live-sync.yaml
live_sync:
  enabled: true
  rollout:
    max_seats: 50        # raised to 500 on day 2, removed on day 5
    excluded_plans: [legacy]
  kill_switch: ops-atlas-sync
\`\`\`

Clients check the flag at startup and on reconnect:

\`\`\`ts
export async function shouldUseLiveSync(workspace: Workspace): Promise<boolean> {
  const flag = await flags.get('live_sync');
  if (!flag.enabled || flag.rollout.excludedPlans.includes(workspace.plan)) {
    return false;
  }
  return workspace.seats <= (flag.rollout.maxSeats ?? Infinity);
}
\`\`\`

## Capacity

Peak sync traffic is estimated from active editors $E$, edits per minute $r$,
and fan-out to $k$ connected clients:

$$
\\text{msgs/s} = \\frac{E \\cdot r \\cdot k}{60} \\approx \\frac{18{,}000 \\times 12 \\times 2.4}{60} = 8{,}640
$$

We provision for **3×** that, i.e. roughly 26k messages per second.

## Risks

> Search ranking changes are the risk we understand least. — *Design review, Sep 14*

| Risk                                  | Likelihood | Impact | Mitigation                                   |
| :------------------------------------ | :--------: | :----: | :------------------------------------------- |
| Sync conflicts on large shared docs   |   Medium   |  High  | Conflict UI + per-doc rate limits            |
| Plugin crashes degrade the editor     |    Low     |  High  | Sandboxed workers, 50 ms budget per event    |
| Ranking regressions for old queries   |   Medium   | Medium | Shadow-rank 5% of traffic for two weeks      |

## Open questions

- Do we keep the batch importer as a fallback for one release, or remove it?
- Who owns plugin review after launch: Developer Relations or Platform?
- Should the press briefing demo use a customer workspace or our own?

---

*Last reviewed in the [launch sync](../meeting-notes/2026-09-28%20Launch%20Sync.md).*

[^bench]: Benchmarked on the \`docs-1m\` fixture, warm cache, see [performance tuning](../../docs/guides/performance-tuning.md).
`;

const ARCHITECTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" font-family="-apple-system, sans-serif" font-size="14">
  <rect x="10" y="50" width="120" height="60" rx="8" fill="#e8f0fe" stroke="#4a7bd8"/><text x="70" y="85" text-anchor="middle">Clients</text>
  <rect x="180" y="50" width="120" height="60" rx="8" fill="#e6f4ea" stroke="#3a9a5b"/><text x="240" y="85" text-anchor="middle">Sync service</text>
  <rect x="350" y="50" width="120" height="60" rx="8" fill="#fef7e0" stroke="#c99a1e"/><text x="410" y="85" text-anchor="middle">Index</text>
  <path d="M130 80h50M300 80h50" stroke="#666" stroke-width="2" marker-end="url(#a)"/>
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#666"/></marker></defs>
</svg>
`;

const files = {
  'README.md': note('Atlas', `
Docs, planning and research for **Atlas**, the team knowledge base.

- [Getting started](docs/getting-started/01-installation.md)
- [Q4 roadmap](planning/2026/q4-roadmap.md)
- [Launch plan](planning/2026/launch-plan.md)
`),
  'CHANGELOG.md': note('Changelog', `
## 1.9.2
- Fix duplicate results when searching archived spaces.

## 1.9.0
- Batch importer now runs every 4 hours instead of nightly.
`),
  'CONTRIBUTING.md': note('Contributing', 'Write docs in Markdown, one topic per file. Run `make lint` before opening a PR.'),
  '.git/HEAD': 'ref: refs/heads/main\n',
  '.DS_Store': '',
  '.editorconfig': 'root = true\n\n[*.md]\ntrim_trailing_whitespace = false\n',
  'Makefile': 'lint:\n\tnpx markdownlint "**/*.md"\n',

  'docs/getting-started/01-installation.md': note('Installation', 'Download Atlas for macOS, Windows or Linux, or run `brew install atlas`.'),
  'docs/getting-started/02-configuration.md': note('Configuration', 'Atlas reads `~/.atlas/config.yaml`. Every key is optional.'),
  'docs/getting-started/03-your-first-space.md': note('Your first space', 'Spaces group related documents. Create one with **New → Space**.'),
  'docs/guides/deployment.md': note('Deployment', 'Run Atlas behind a reverse proxy and terminate TLS at the proxy.'),
  'docs/guides/migrating-from-v1.md': note('Migrating from 1.x', 'Live sync replaces the batch importer. Existing imports keep working until 2.1.'),
  'docs/guides/performance-tuning.md': note('Performance tuning', 'Warm the search cache after deploys with `atlas index warm`.'),
  'docs/guides/troubleshooting.md': note('Troubleshooting', 'Most sync errors are clock skew. Check `atlas doctor` first.'),
  'docs/reference/api/authentication.md': note('Authentication', 'All requests use bearer tokens scoped to a workspace.'),
  'docs/reference/api/endpoints.md': note('Endpoints', '| Method | Path | Description |\n|---|---|---|\n| GET | `/v2/docs` | List documents |\n| POST | `/v2/docs` | Create a document |'),
  'docs/reference/api/errors.md': note('Errors', 'Errors use RFC 9457 problem details.'),
  'docs/reference/api/webhooks.md': note('Webhooks', 'Webhooks are signed with HMAC-SHA256; verify the `Atlas-Signature` header.'),
  'docs/reference/cli.md': note('CLI reference', '`atlas sync`, `atlas index`, `atlas doctor`.'),
  'docs/reference/config-schema.json': '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object"\n}\n',

  'planning/2026/launch-plan.md': LAUNCH_PLAN,
  'planning/2026/q3-retrospective.md': note('Q3 retrospective', '**Went well:** search latency work. **Didn\'t:** importer reliability.'),
  'planning/2026/q4-roadmap.md': note('Q4 roadmap', '1. Live sync\n2. Plugin system\n3. Search ranking v3'),
  'planning/2026/hiring-plan.md': note('Hiring plan', 'Two platform engineers and one developer advocate by December.'),
  'planning/rfcs/0001-plugin-system.md': note('RFC 0001: Plugin system', 'Plugins run in sandboxed workers with a 50 ms budget per event.'),
  'planning/rfcs/0002-offline-sync.md': note('RFC 0002: Offline sync', 'Clients keep an operation log and replay it on reconnect.'),
  'planning/rfcs/0010-search-ranking-v3.md': note('RFC 0010: Search ranking v3', 'Blend BM25 with recency and click-through signals.'),
  'planning/meeting-notes/2026-09-14 Design Review.md': note('Design review: Sep 14', 'Agreed to shadow-rank 5% of traffic before switching ranking.'),
  'planning/meeting-notes/2026-09-28 Launch Sync.md': note('Launch sync: Sep 28', 'Docs are at risk; moving two writers onto migration guides.'),
  'planning/meeting-notes/2026-10-05 Weekly.md': note('Weekly: Oct 5', 'Load test passed at 3× peak. Rollback drill scheduled.'),
  'planning/archive/2025/2025-roadmap.md': note('2025 roadmap', 'Archived.'),

  'research/interviews/participant-01.md': note('Interview: participant 01', '"I search more than I browse."'),
  'research/interviews/participant-02.md': note('Interview: participant 02', '"Sync delays make me copy-paste into chat instead."'),
  'research/interviews/participant-10.md': note('Interview: participant 10', '"Plugins for our ticketing system would sell this internally."'),
  'research/competitive-analysis.md': note('Competitive analysis', 'Most competitors sync in real time; few support plugins.'),
  'research/survey-results.csv': 'question,agree,neutral,disagree\nSearch is fast,41,22,37\nSync is reliable,33,25,42\n',

  'assets/brand/logo.svg': ARCHITECTURE_SVG,
  'assets/brand/wordmark.png': '',
  'assets/diagrams/architecture.svg': ARCHITECTURE_SVG,
  'assets/diagrams/sync-flow.mmd': 'flowchart LR\n  Client --> Sync --> Index\n',

  'templates/meeting-notes.md': note('Meeting: {{title}}', '**Attendees:**\n\n**Decisions:**\n\n**Action items:**'),
  'templates/rfc.md': note('RFC NNNN: {{title}}', '## Problem\n\n## Proposal\n\n## Alternatives'),
};

rmSync(root, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
console.log(`Created ${root} (${Object.keys(files).length} files)`);
