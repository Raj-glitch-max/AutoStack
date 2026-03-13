# ╔══════════════════════════════════════════════════════════════════╗
# ║     AUTOSTACK — ULTIMATE BUILD PROMPT v2.0                      ║
# ║     For: Google Firebase Studio / Project IDX / Any AI IDE      ║
# ║     Target: React + Tailwind, single-file, full SaaS app        ║
# ╚══════════════════════════════════════════════════════════════════╝

---

## HOW TO USE THIS PROMPT

Paste this entire document into your Google AI IDE prompt. It contains:
1. **Exact Figma design tokens** — extracted directly from the built design
2. **Full page specs** — every section of the landing page pixel-perfect
3. **Complete dashboard specs** — all 7 tabs, every component
4. **UPGRADE LIST** — creative enhancements to layer on top

---

# SECTION 1 — WHAT WAS BUILT IN FIGMA (EXACT DESIGN TOKENS)

The Figma design was inspected directly. These are the EXACT values used:

## Color System

```css
:root {
  /* Backgrounds */
  --bg-base:        #111621;   /* Page background */
  --bg-surface:     #0d1117;   /* Terminal/card background */
  --bg-card:        #1a2233;   /* Feature cards, pricing cards */

  /* Borders */
  --border-default: #334366;   /* All card borders */
  --border-active:  #2463eb;   /* Pro tier card, active states */

  /* Text */
  --text-primary:   #f1f5f9;   /* Headings, body text */
  --text-secondary: #cbd5e1;   /* Nav links */
  --text-muted:     #92a4c8;   /* Subtitles, descriptions */
  --text-dim:       #4a5568;   /* Footer, timestamps */

  /* Terminal colors */
  --term-prompt:    #4ade80;   /* $ prompt and success lines */
  --term-cmd:       #4ade80;   /* Command text */
  --term-info:      #60a5fa;   /* Info output lines */
  --term-text:      #cbd5e1;   /* Regular output lines */
  --term-yellow:    #facc15;   /* Image tags, highlights */
  --term-muted:     #92a4c8;   /* Terminal bar label */

  /* Brand accent */
  --blue-primary:   #2463eb;   /* CTA buttons, active borders, links */
  --blue-light:     #60a5fa;   /* Terminal info, highlights */

  /* Status */
  --green:          #4ade80;   /* Success states */
  --amber:          #f59e0b;   /* Warnings */
  --red:            #f43f5e;   /* Errors/danger */
  --purple:         #a78bfa;   /* Purple accent */
  --cyan:           #22d3ee;   /* Cyan accent */
}
```

## Typography (Exact from Figma)

| Element | Font | Weight | Size | Color |
|---------|------|--------|------|-------|
| Navbar brand | Inter | Bold 700 | 20px | #f1f5f9 |
| H1 hero | Inter | Black 900 | 60px | #f1f5f9 |
| H2 sections | Inter | Bold 700 | 36px | #f1f5f9 |
| Card titles | Inter | Bold 700 | 18–20px | #f1f5f9 |
| Body text | Inter | Regular | 14–18px | #92a4c8 |
| Nav links | Inter | Medium 500 | 14px | #cbd5e1 |
| Pricing price | Inter | Black 900 | 30px | #f1f5f9 |
| Terminal text | Liberation Mono / JetBrains Mono | Regular | 14px | varies |
| Feature list items | Inter | Regular | 14px | #f1f5f9 |
| Footer links | Inter | Regular | 14px | #92a4c8 |
| Button text | Inter | Bold/Medium | 14–16px | white |

## Spacing & Layout

- Page max-width: 960px, centered
- Section padding: 64–96px vertical
- Card padding: 25px
- Card border-radius: 12px
- Card border: 1px solid #334366
- Card background: #1a2233
- Grid gap: 24px
- Navbar height: 73px sticky
- Hero gradient: radial from top center rgba(36,99,235,0.2) → transparent

## Key Components (Exact from Figma)

### Navbar
```
bg: rgba(17,22,33,0.8), backdrop-blur: 6px
border-bottom: 1px solid #334366
logo: layers icon + "AutoStack" Inter Bold 20px
nav links: Features / How it Works / Pricing — Inter Medium 14px #cbd5e1
CTA button: bg #2463eb, rounded-lg, px-16 py-10, "Get Started" Inter Bold 14px white
```

### Hero Section
```
Radial gradient overlay: from rgba(36,99,235,0.2) at top to transparent at 50%
Badge: bg rgba(36,99,235,0.1) border rgba(36,99,235,0.3) rounded-full
  — pulsing blue dot + "AutoStack Beta is live" Inter Medium 14px #2463eb
H1: "Deploy to Kubernetes.\nIn 60 seconds." Inter Black 60px tracking-[-3px] #f1f5f9
Subtext: Inter Regular 20px #92a4c8
CTAs: "Join Beta" (blue fill) + "View Documentation" (bordered) — height 48px rounded-lg
```

### Terminal Card (Hero bottom)
```
bg: #0d1117, border: 1px solid #334366, rounded-xl, shadow: 0 25px 50px rgba(0,0,0,0.25)
Header bar: bg #161b22, border-bottom #334366
  — 3 dots: red rgba(239,68,68,0.8), yellow rgba(234,179,8,0.8), green rgba(34,197,94,0.8)
  — label: "bash - autostack deploy" Liberation Mono 12px #92a4c8 centered
Body: JetBrains Mono 14px, 24px padding, 485px height
Terminal lines (exact):
  $ autostack init my-cluster        → #4ade80
  Initializing AutoStack environment... Done.  → #92a4c8
  $ autostack deploy .               → #4ade80
  Analyzing repository...            → #60a5fa
  Detected Node.js application (Express) → #cbd5e1
  Generating Dockerfile...           → #cbd5e1
  Building image registry.autostack.io/app:v1.0.4... → #cbd5e1 (registry tag in #facc15)
  Pushing image...                   → #cbd5e1
  Applying Kubernetes manifests...   → #60a5fa
  ✓ deployment.apps/api-server created    → #cbd5e1
  ✓ service/api-service created      → #cbd5e1
  ✓ ingress.networking.k8s.io/api-ingress configured → #cbd5e1
  Deploy successful! 🚀              → #4ade80 Bold
  Live URL: https://api.myapp.com   → #92a4c8
  _ (blinking cursor)                → #4ade80
```

### Features Section (6 cards, 3-column grid)
```
Title: "Powerful Kubernetes Operations" Inter Bold 36px
Subtitle: "Everything you need to deploy and manage workloads effortlessly."
Grid: 3 cols × 2 rows, 24px gap
Each card: bg #1a2233, border #334366, rounded-xl, p-25px
  — 48×48px icon image
  — Title: Inter Bold 18px #f1f5f9
  — Body: Inter Regular 14px #92a4c8 leading-[22.75px]

Cards:
  1. Automated Scaling — scale based on real-time traffic metrics
  2. Deep Observability — metrics, tracing, aggregated logs
  3. Zero Downtime — rolling updates and canary deployments
  4. RBAC Enforcement — granular access through intuitive UI
  5. Secret Management — securely store, rotate, inject secrets
  6. Multi-Cloud Ready — AWS EKS, GCP GKE, Azure AKS, on-premise
```

### Architecture Section
```
Title: "How it works" Inter Bold 36px
Subtitle: "A streamlined architecture designed for developer velocity."
Diagram card: bg #1a2233, border #334366, rounded-xl, aspect-ratio 21/9
  — Placeholder text + icon (in original, replace with real SVG diagram)
```

### Pricing Section (3 cards)
```
Title: "Simple, transparent pricing"
Subtitle: "Start for free, upgrade when you need more power."

Hobby ($0/mo):
  bg #1a2233, border #334366, p-25px, rounded-xl
  Features: 1 Cluster, 5 Deployments, Community Support
  CTA: "Start Free" — bordered button

Pro ($49/mo): ← HIGHLIGHTED
  bg #1a2233, border-2 #2463eb (blue glow), p-26px, rounded-xl
  "MOST POPULAR" ribbon: bg #2463eb, rounded-full, top -12px centered
  Features: 5 Clusters, Unlimited Deployments, Advanced Observability, Email Support
  CTA: "Get Pro" — bg #2463eb button

Team ($199/mo):
  bg #1a2233, border #334366, p-25px, rounded-xl
  Features: Unlimited Clusters, Unlimited Deployments, SSO & Advanced RBAC, 24/7 Priority Support
  CTA: "Contact Sales" — bordered button

Feature checklist icon: green checkmark SVG (#4ade80), 9.5×7px
```

### Footer
```
bg #111621, border-top #334366, py-40 px-160
Logo left + "AutoStack" brand
Center-right: Twitter / GitHub / Discord — Inter Regular 14px #92a4c8
Right: "© 2024 AutoStack Inc. All rights reserved." — #92a4c8
```

---

# SECTION 2 — FULL DASHBOARD SPEC (POST-LOGIN)

The Figma only contained the Landing Page. Build the full dashboard as a second view. Switch between views with a React state variable `view` = "landing" | "dashboard". "Open Dashboard" / "Get Started" button on landing → sets view to "dashboard". AutoStack logo in sidebar → sets view back to "landing".

## Dashboard Shell

```
Layout: Fixed sidebar 220px + sticky top bar 52px + fluid content area
Body: bg #111621 with grid overlay (see background system below)
```

### Sidebar (220px, fixed, full height)
```
bg: #0d1117, border-right: 1px solid #334366

Top section:
  Org switcher: bg #1a2233 rounded-lg p-12 flex items-center gap-8
    — 26×26 gradient avatar (blue: #1e3a5f → #2463eb)
    — "Acme Corp" Inter Medium 13px #f1f5f9
    — ChevronDown icon 14px #92a4c8

Cluster badge card (below org switcher):
  bg #111621 border #334366 rounded-lg p-12 mt-8
  — green dot (6px, glow) + "prod-eks-us-east-1" JetBrains Mono 11px #f1f5f9
  — "EKS · 6 nodes" Inter 11px #92a4c8
  — Health score "94" right-aligned JetBrains Mono #4ade80

Nav sections:
  Label: "PLATFORM" Inter 10px tracking-widest #4a5568 px-12 mt-20 mb-4

Nav items (icon 16px + label 13px Inter):
  Overview    (LayoutDashboard icon)
  Projects    (FolderGit2 icon)
  Pipelines   (GitBranch icon)
  Infrastructure (Server icon)
  Monitoring  (Activity icon)
  Logs        (FileText icon)

Divider: 1px #334366 my-12

  Settings    (Settings icon)

Active state: bg rgba(36,99,235,0.1) text #2463eb border-l-2 border-l-#2463eb
Hover state: bg #1a2233 transition 0.15s
Each item: flex items-center gap-10 px-12 py-8 rounded-r-md cursor-pointer

Bottom:
  User row: 26×26 gradient avatar + "Alex Chen" Inter Medium 12px + "alex@acme.com" 11px muted
```

### Top Bar (52px, sticky)
```
bg: #0d1117, border-bottom: 1px solid #334366, px-24 flex items-center justify-between

Left:
  Page title: "Overview" Inter SemiBold 15px #f1f5f9
  Subtitle: "prod-eks-us-east-1" Inter 11px #92a4c8

Right:
  Search box: bg #1a2233 border #334366 rounded-md px-12 py-6
    — Search icon 14px #92a4c8 + "Search..." + ⌘K badge JetBrains Mono 11px
  Bell icon with red dot (3 new)
  Avatar: 28px gradient circle
```

## Dashboard Tabs

### TAB 1 — OVERVIEW

```
Cluster header card:
  bg gradient: linear from #0d1937 to #111621
  border: 1px solid rgba(36,99,235,0.3)
  rounded-xl p-24 mb-24
  Left: green dot 6px glow + "prod-eks-us-east-1" Inter Bold 18px
    + "Healthy" green tag + "v1.28.3" muted tag
  Stats row: "6 nodes" / "42 pods running" / "8 projects" / "~$847/mo"
    — JetBrains Mono 13px for values, Inter 11px muted for labels
  Right: "View Metrics" secondary button + "New Project" blue primary button

Score cards row (4 cards, equal width):
  Security:         score 87,  color #4ade80  (green)
  Reliability:      score 94,  color #2463eb  (blue)
  Cost Efficiency:  score 73,  color #f59e0b  (amber)
  Performance:      score 91,  color #a78bfa  (purple)

  Each card: bg #1a2233 border #334366 rounded-xl p-20
    — label: "SECURITY" Inter 11px tracking-widest #92a4c8
    — score: Inter Black 40px in accent color
    — progress bar: 4px, 2px radius, color-tinted fill, animated on mount
    — delta badge top-right: "+2" green / "-1" red / "0" muted

2-column grid (gap 24px):
  LEFT — Request Throughput chart:
    Title: "Request Throughput" + time range tabs: 1h / 6h / 24h / 7d
    Recharts AreaChart, height 200px
    Data: fake time series, smooth line, gradient fill 0.3→0 opacity
    Colors: stroke #2463eb, fill url(blueGrad)
    Grid: dashed #1a2233, axis: #334366, ticks: #92a4c8 11px

  RIGHT — Activity Feed:
    Title: "Recent Activity" + "LIVE" green pulsing badge
    5 event rows, each: colored dot + message 13px + time-ago 10px muted
    Events:
      🟢 deploy: api-gateway deployed v2.1.4 — 2m ago
      🔵 pr: COIE opened PR #47 — resource limits — 8m ago
      🔴 incident: AIRE resolved OOMKilled — worker-queue — 15m ago
      🟢 merge: PR #45 merged — security context — 1h ago
      🟡 score: Security score improved +3 → 87 — 2h ago
```

### TAB 2 — PROJECTS

```
Header: "Projects" Inter Bold 20px + "8 repositories" muted + "New Project" blue button

Table card: bg #0d1117 border #334366 rounded-xl overflow-hidden
Column headers: uppercase 11px tracking-widest #92a4c8, border-bottom #334366
  PROJECT | STACK | ENVIRONMENT | HEALTH | DEPLOYMENTS | STATUS | —

Rows (7 projects):
  api-gateway    | Node.js  | PROD (amber)    | 94 | 142 | ● Healthy    | ↗
  user-service   | Python   | PROD (amber)    | 88 | 87  | ● Healthy    | ↗
  worker-queue   | Go       | PROD (amber)    | 71 | 34  | ● Degraded   | ↗
  frontend-app   | React    | PROD (amber)    | 96 | 203 | ● Healthy    | ↗
  ml-inference   | Python   | STAGING (blue)  | 62 | 12  | ● Warning    | ↗
  billing-svc    | Node.js  | PROD (amber)    | 91 | 76  | ● Healthy    | ↗
  analytics-svc  | Go       | STAGING (blue)  | 85 | 29  | ● Healthy    | ↗

Health cell: score number + 60px inline progress bar
Stack cell: JetBrains Mono 12px, colored: Node.js=#4ade80, Python=#60a5fa, Go=#22d3ee, React=#a78bfa
Row hover: bg rgba(255,255,255,0.02)

New Project Modal (triggered on button click):
  Overlay: fixed, bg rgba(0,0,0,0.6), backdrop-blur 4px
  Modal: bg #0d1117 border #334366 rounded-xl, 520px wide, shadow 0 32px 80px rgba(0,0,0,0.5)
  Animation: fadeUp 0.3s on mount
  Fields:
    — Repository URL input (full width)
    — Branch input (half) + Environment select (half)
    — AWS Region select (full)
  Info box: bg rgba(36,99,235,0.05) border rgba(36,99,235,0.2) rounded-lg p-16
    "AutoStack will generate:" + tags for Dockerfile, K8s manifests, HPA, NetworkPolicy, ArgoCD App
  Footer: "Cancel" secondary + "Connect repository →" blue primary
  On submit: spinner state "Analyzing..." 3s → success "✓ PR #48 opened"
```

### TAB 3 — PIPELINES

```
Header: "Pipelines" + "5 pipelines · 1 running · 1 failed" muted + Refresh icon button

Pipeline cards (vertical list, gap 8px):
Each card: bg #1a2233 border #334366 rounded-xl px-20 py-16 flex items-center

  api-gateway    SUCCESS  run #142  main  a3f7b2c  2m 14s  3h ago
  user-service   RUNNING  run #88   main  9d4e1a8  1m 47s  just now (pulsing blue dot)
  worker-queue   FAILED   run #35   fix/  c8b9d3f  0m 52s  5m ago   (red dot)
  frontend-app   SUCCESS  run #204  main  7e2a4f1  4m 02s  12m ago
  ml-inference   QUEUED   run #13   feat/ d5c7b6e  —       1h ago   (gray dot)

Right side of each: 8 stage bars (28×5px each)
  SUCCESS:  all 8 green
  RUNNING:  5 green, 1 blue (pulsing), 2 gray
  FAILED:   3 green, 1 red, 4 gray
  QUEUED:   all gray
Stage names tooltip on hover: checkout / install / lint / test / build / push / deploy / verify

StatusDot: 6px circle, inline before service name
  SUCCESS=green (with glow), RUNNING=blue (pulse 1.5s), FAILED=red, QUEUED=gray
```

### TAB 4 — INFRASTRUCTURE

```
Header: "Infrastructure" + "us-east-1" muted tag

2-column grid of resource cards:
Each card: bg #1a2233 border #334366 rounded-xl p-20, hover translateY(-2px) transition

1. EKS Cluster        HEALTHY (green tag)
   "6 nodes · v1.28.3"  JetBrains Mono
   CPU: [████████░░] 64%  Memory: [██████░░░░] 58%

2. RDS PostgreSQL      HEALTHY (green tag)
   "db.t3.medium · us-east-1a"
   CPU: [████░░░░░░] 38%  Memory: [██████████] 91% (red bar)

3. ElastiCache Redis   HEALTHY (green tag)
   "cache.t3.micro · 2 nodes"
   CPU: [███░░░░░░░] 27%  Memory: [████░░░░░░] 43%

4. ALB Ingress         HEALTHY (green tag)
   "alb-prod-us-east-1"
   Requests/s: 847  Latency: 23ms

5. S3 Buckets          HEALTHY (green tag)
   "4 buckets · 2.3 TB"
   (no bars, just stats)

6. ECR Registry        WARNING (amber tag)
   "8 repos · 47 images"
   "3 images with critical CVEs"  red text 12px

CPU bar: green if <70%, amber if 70–90%, red if >90%
Progress bars: 4px height, animated on mount
```

### TAB 5 — MONITORING

```
Header: "Monitoring" + "Last 24 hours · 5-min resolution" muted

4 metric stat cards (row):
  Avg CPU:      64.2%   delta: +2.1% (red, worse)    color: #2463eb
  Avg Memory:   71.8%   delta: -3.4% (green, better) color: #a78bfa
  Req/min:      1,247   delta: +18% (green)           color: #4ade80
  p99 Latency:  142ms   delta: -8ms (green, better)   color: #f59e0b

  Each: muted 11px label, Inter Black 28px value in accent, delta badge

2×2 chart grid (each chart card: bg #1a2233 border #334366 rounded-xl p-20):
  1. CPU Utilization %     — blue line  #2463eb
  2. Memory Utilization %  — purple line #a78bfa
  3. Requests/min          — green line  #4ade80
  4. Latency ms (p99)      — amber line  #f59e0b

  Each chart: Recharts AreaChart 180px height
  Gradient fill: 0.25 opacity top → 0 bottom
  Grid lines: #1a2233, axis ticks: #92a4c8 11px
  Tooltip: bg #0d1117 border #334366 rounded p-8
```

### TAB 6 — DEPLOYMENT LOGS

```
Header: "Deployment Logs" + "Real-time · auto-scroll enabled"

Filter row:
  Toggle tabs: ALL (active) / INFO / WARN / SUCCESS — Inter 12px
  "Copy all" ghost button right

Terminal card:
  bg #0d1117 border #334366 rounded-xl overflow-hidden
  macOS header: bg #161b22 border-bottom #334366 flex items-center px-16 py-12
    — 3 dots (red/yellow/green 12px)
    — center label: JetBrains Mono 12px "autostack logs --follow --cluster prod-eks-us-east-1"
    — right: "LIVE" badge green pulsing dot
  
  Log body: JetBrains Mono 12px, px-24 py-16, height 480px, overflow-y scroll
  Each line: timestamp(muted) + level(colored) + [service](purple) + message
  
  Lines (20+ lines):
    10:24:01  INFO    [argocd]      Sync triggered for api-gateway
    10:24:02  INFO    [argocd]      Cloning repository main branch
    10:24:04  INFO    [kubelet]     Pulling image registry.autostack.io/api:v2.1.4
    10:24:08  INFO    [kubelet]     Image pull complete (1.2GB)
    10:24:09  INFO    [k8s-api]     Creating pod api-gateway-7d9f4b6c-xk8pl
    10:24:10  INFO    [k8s-api]     Pod scheduled on node ip-10-0-1-23
    10:24:11  INFO    [kubelet]     Container starting...
    10:24:13  SUCCESS [kubelet]     Readiness probe passed
    10:24:13  SUCCESS [argocd]      Rollout complete — 3/3 replicas ready
    10:24:14  INFO    [coie]        COIE cycle starting for prod-eks-us-east-1
    10:24:18  INFO    [coie]        Evaluated 42 workloads in 4.2s
    10:24:18  WARN    [coie]        ECR: 3 images have critical CVEs (worker-queue, ml-inference)
    10:24:18  SUCCESS [coie]        Score report: Security 87 (+2) Reliability 94 Cost 73 Perf 91
    10:24:19  INFO    [aire]        Monitoring event stream...
    _  (blinking cursor)

Level colors: INFO=#60a5fa  WARN=#f59e0b  SUCCESS=#4ade80  ERROR=#f43f5e
Service tags: [argocd]=#a78bfa  [kubelet]=#92a4c8  [k8s-api]=#22d3ee  [coie]=#4ade80  [aire]=#f59e0b
Row hover: bg rgba(255,255,255,0.02)
```

### TAB 7 — SETTINGS

```
Layout: 200px left settings sidebar + main content

Settings sidebar nav:
  Cloud Credentials (active)
  Integrations
  Notifications
  Team & Access
  (same styling as main sidebar nav items)

CREDENTIALS SUB-PAGE:
  Title: "Cloud Credentials"
  Subtitle: "AutoStack uses IAM roles — no long-lived credentials stored."
  
  AWS connected card: bg #1a2233 border #334366 rounded-xl p-20
    Left: AWS logo icon + "Amazon Web Services"
    Right: "Connected" green tag
    Detail rows (label + JetBrains Mono value):
      Account ID: 123456789012
      Region:     us-east-1
      Role ARN:   arn:aws:iam::123456789012:role/AutoStackRole
      Last verified: 2 minutes ago
    Buttons: "Re-verify" secondary + "Disconnect" danger ghost

  Dashed "Add cloud provider" card: border-dashed #334366 rounded-xl p-20 text-center
    + icon + "Add cloud provider"
    Hover: border-color #2463eb bg rgba(36,99,235,0.03)

INTEGRATIONS SUB-PAGE:
  6 integration cards (vertical list):
  GitHub    CONNECTED  — "Repository integration for PR generation"
  Jenkins   DISCONNECTED
  AWS       CONNECTED
  Slack     CONNECTED  — "Incident alerts to #devops-alerts"
  PagerDuty DISCONNECTED
  Datadog   DISCONNECTED
  Each: 36px icon box + name Inter Bold 14px + status tag + description + Connect/Configure button

NOTIFICATIONS SUB-PAGE:
  "Event Triggers" card:
    Deployment events  [toggle ON]
    AIRE incidents     [toggle ON]
    Score changes      [toggle OFF]
    Weekly digest      [toggle ON]
  
  "Notification Channels" card:
    Slack email PagerDuty [toggles]
  
  "Save" blue button → 2s "✓ Saved!" checkmark state

TEAM & ACCESS SUB-PAGE:
  Member list card:
  Avatar + Name + Email + Role tag + (actions)
  Alex Chen   alex@acme.com   OWNER    (gradient blue avatar)
  Sarah Kim   sarah@acme.com  ADMIN    (gradient green avatar)
  Marcus Lee  marcus@acme.com DEVELOPER (gradient purple avatar)
  
  "Invite member" secondary button at bottom
```

---

# SECTION 3 — BACKGROUND & ATMOSPHERE SYSTEM

Apply these to the main content area and body:

```css
/* Grid overlay on content area */
.content-area {
  background-image:
    linear-gradient(rgba(36,99,235,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36,99,235,0.04) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* Noise grain on body::after */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,..."); /* feTurbulence SVG */
  z-index: 9999;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #334366; border-radius: 4px; }
```

---

# SECTION 4 — ALL ANIMATIONS

```css
@keyframes fadeUp {
  from { transform: translateY(18px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.35; }
}
@keyframes blink {
  0%,100% { opacity: 1; }
  50%      { opacity: 0; }
}
@keyframes glow-pulse {
  0%,100% { box-shadow: 0 0 4px #4ade80; }
  50%      { box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74,222,128,0.3); }
}
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
```

- Landing page load: all sections `animation: fadeUp 0.5s ease forwards` staggered (delay: 0, 0.1s, 0.2s, 0.3s...)
- Terminal typewriter: `useEffect` → `setTimeout` per line, append to state array
- Tab switch: active content `animation: fadeIn 0.2s ease`
- Modal mount: `animation: fadeUp 0.3s cubic-bezier(0.34,1.56,0.64,1)`
- Score cards: ProgressBar width animates `0 → actualValue` on mount via CSS transition 1s
- Status dots: green has `animation: glow-pulse 2s infinite`, amber/blue have pulse
- Blinking cursor: `animation: blink 1s step-end infinite`

---

# SECTION 5 — BUILD INSTRUCTIONS

```
1. Single React file, no routing library
2. All CSS via Tailwind + inline styles for custom CSS vars
3. Import fonts from Google Fonts CDN:
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
4. State:
   const [view, setView] = useState('landing')        // 'landing' | 'dashboard'
   const [activeTab, setActiveTab] = useState('overview')
   const [settingsTab, setSettingsTab] = useState('credentials')
   const [showNewProjectModal, setShowNewProjectModal] = useState(false)
   const [terminalLines, setTerminalLines] = useState([])   // typewriter
5. Chart library: Recharts (AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer)
6. Icons: Lucide React (strokeWidth={1.5}, size 14–20)
7. Architecture diagram: inline SVG with actual nodes, arrows, labels
8. NO external UI libs (no shadcn, MUI, Chakra)
```

---

# SECTION 6 — ⚡ UPGRADE LIST (CREATIVE ENHANCEMENTS)

Layer these on top of the base design to make it truly next-level:

## 🔥 UPGRADE 1 — Animated Terminal Typewriter
The terminal on the landing page must have a REAL typewriter effect. Use `useEffect` + `setTimeout` chain to print each line one by one with variable speed (commands: 80ms/char, output: 20ms/char). Blinking cursor while typing, then static at end. Add a subtle scanline effect over the terminal body using a CSS repeating-linear-gradient.

## 🔥 UPGRADE 2 — Particle/Grid Background on Hero
Replace the static radial gradient in the hero with a **Three.js particle field** or **canvas-based dot grid** that slowly drifts. Dots are tiny (1.5px), color rgba(36,99,235,0.4), connected by lines when close. This runs as a fixed background layer behind the hero text.

Alternative (simpler): Use CSS `animation` on the grid overlay — slowly shift the background-position to create a moving grid effect.

## 🔥 UPGRADE 3 — Score Cards with Animated Number Count-Up
When the Overview tab loads, score numbers count up from 0 to their value over 800ms using `requestAnimationFrame` with easeOutCubic. Progress bars fill simultaneously. Delta badges fade in after the count-up completes.

## 🔥 UPGRADE 4 — Real SVG Architecture Diagram
Replace the placeholder in the "How it works" section with a REAL interactive SVG diagram:
```
Nodes (rounded rect): Git Repo → DIE Engine → Pull Request → ArgoCD → K8s Cluster
                                                              ↑
                                          COIE Engine ← ← ← ← ← → AIRE Engine
                                              ↓
                                         Fix PRs

Arrows: animated stroke-dashoffset to make data flow visible (dashes traveling along arrows)
Colors: Git=#92a4c8, DIE=#2463eb, PR=#a78bfa, ArgoCD=#a78bfa, K8s=#4ade80, COIE=#22d3ee, AIRE=#f43f5e
Labels: JetBrains Mono 11px on arrows: "clone + analyze", "opens PR", "GitOps sync", "metrics (mTLS)"
K8s cluster node shows 3 mini pod rows inside
Hover on any node: card lifts with glow, shows tooltip description
```

## 🔥 UPGRADE 5 — Live Log Stream Simulation
In the Logs tab, implement a REAL simulated live stream:
- New log lines append every 800–2000ms (random interval)
- Auto-scroll to bottom (unless user has scrolled up)
- Each new line fades in with `animation: fadeIn 0.3s`
- Line colors follow the exact color system
- The LIVE badge pulses in sync with new lines

## 🔥 UPGRADE 6 — Pipeline Stage Bars with Micro-animation
When a pipeline is "RUNNING", the current stage bar should have a shimmer animation (moving highlight left → right). Failed stage bars pulse red. Hovering any stage bar shows a tooltip with stage name + duration.

## 🔥 UPGRADE 7 — Glassmorphism Modals
Modals should have:
- `backdrop-filter: blur(12px) saturate(180%)`
- `background: rgba(13,17,23,0.85)`
- `box-shadow: 0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)`
- Top edge highlight: `border-top: 1px solid rgba(255,255,255,0.1)`
- Content mounts with spring-like `cubic-bezier(0.34,1.56,0.64,1)` — slight overshoot

## 🔥 UPGRADE 8 — Chart Tooltip Upgrade (Recharts)
Custom Recharts tooltip component:
```
bg: #0d1117, border: 1px solid #334366, border-radius: 8px, p: 12px
Label: time in JetBrains Mono 11px #92a4c8
Value: Inter Bold 14px in chart accent color + unit
Shadow: 0 8px 24px rgba(0,0,0,0.4)
```
Area charts: gradient fill using SVG `<linearGradient>` (opacity 0.3 top → 0 bottom)

## 🔥 UPGRADE 9 — Hero Stats Counter Animation
The stats row under the CTA buttons: "500+ Clusters", "2.1M+ Deployments", "89% MTTR reduction" — numbers count up from 0 on page load with easeOut.

## 🔥 UPGRADE 10 — Keyboard Navigation Easter Egg
Press `⌘K` anywhere to open a command palette modal:
```
bg #0d1117 border #334366 rounded-xl shadow heavy, 560px wide, top center
Input: search icon + "Search anything..." placeholder
Sections: Recent / Navigate / Actions
Items: icon + label + keyboard shortcut badge
Navigate: Overview, Projects, Pipelines, etc.
Actions: New Project, Copy cluster ID, Toggle theme
Keyboard: arrow keys to navigate, Enter to select, Esc to close
```

## 🔥 UPGRADE 11 — Micro-interaction on Buttons
All primary buttons:
- Hover: `translateY(-1px)` + `box-shadow: 0 4px 16px rgba(36,99,235,0.4)`
- Active: `translateY(0)` + shadow reduces
- Click ripple effect: small circle expands and fades from click point

## 🔥 UPGRADE 12 — Score Card Hover Sparkline
Hovering any score card on Overview reveals a small sparkline (mini Recharts LineChart, 80×28px) showing the last 24h trend for that metric — appears with `fadeIn 0.2s`. No axes, just the line.

---

# SECTION 7 — FIGMA DESIGN GAPS TO FIX

The Figma design had these issues — fix them in the rebuild:

1. **Font issue**: Figma used Liberation Mono (not available in browsers) → use `JetBrains Mono` from Google Fonts
2. **Architecture diagram**: Was a placeholder → build real SVG diagram (see Upgrade 4)
3. **Dashboard**: Not designed in Figma → build entire dashboard from spec in Section 2
4. **Mobile**: Not designed → build responsive at 768px+ (sidebar collapses to icon-only at <1024px)
5. **Pricing ribbon**: "MOST POPULAR" positioning was hardcoded → make it dynamic
6. **Feature card icons**: Were image assets from Figma → replace with Lucide React icons in tinted containers:
   - Automated Scaling → `Zap` icon in amber container
   - Deep Observability → `Eye` icon in blue container
   - Zero Downtime → `RefreshCw` icon in green container
   - RBAC Enforcement → `Shield` icon in purple container
   - Secret Management → `Lock` icon in cyan container
   - Multi-Cloud Ready → `Cloud` icon in red container
7. **H1 rendering**: Hero had a very subtle spec-correct font rendering issue with letter-spacing → ensure `letter-spacing: -3px` on H1
8. **Hero gradient**: The radial gradient needs to be behind text, not covering it → use a `::before` absolute overlay

---

# SECTION 8 — COMPLETE FILE STRUCTURE

Build everything in a single React component file:

```
App.jsx
├── Global CSS (inside <style> tag or Tailwind config)
│   ├── CSS custom properties
│   ├── @keyframe animations
│   ├── Scrollbar styles
│   └── Background grid overlay
│
├── Utility Components
│   ├── StatusDot
│   ├── Tag/Badge
│   ├── Button
│   ├── Card
│   ├── ProgressBar
│   ├── ToggleSwitch
│   └── TerminalWindow
│
├── Landing Page
│   ├── Navbar
│   ├── HeroSection
│   ├── TerminalDemo
│   ├── FeaturesGrid
│   ├── ArchitectureDiagram (SVG)
│   ├── PricingSection
│   ├── CTABanner
│   └── Footer
│
├── Dashboard Shell
│   ├── Sidebar
│   └── TopBar
│
├── Dashboard Tab Contents
│   ├── OverviewTab
│   ├── ProjectsTab + NewProjectModal
│   ├── PipelinesTab
│   ├── InfrastructureTab
│   ├── MonitoringTab
│   ├── LogsTab (with live simulation)
│   └── SettingsTab
│       ├── CloudCredentials
│       ├── Integrations
│       ├── Notifications
│       └── TeamAccess
│
└── Main App state + routing logic
```

---

# SECTION 9 — FAKE DATA CONSTANTS

Define these as constants at the top of the file for realistic charts/tables:

```javascript
// Chart data: 24 data points (hourly for 24h)
const metricsData = Array.from({length: 24}, (_, i) => ({
  time: `${String(i).padStart(2,'0')}:00`,
  cpu: 45 + Math.sin(i/3) * 20 + Math.random() * 10,
  memory: 60 + Math.cos(i/4) * 15 + Math.random() * 8,
  requests: 800 + Math.sin(i/2) * 400 + Math.random() * 100,
  latency: 120 + Math.sin(i/3.5) * 40 + Math.random() * 20,
}));

// Score history (last 7 days daily)
const scoreHistory = [82, 85, 83, 87, 84, 88, 87];

// Projects table data (as shown in Section 2)
// Pipelines data (as shown in Section 2)
// Log lines (as shown in Section 2)
```

---

# FINAL CHECKLIST

Before considering the build complete, verify:

- [ ] Landing page matches Figma EXACTLY (colors, spacing, typography, layout)
- [ ] Terminal has real typewriter animation
- [ ] Dashboard has all 7 tabs working
- [ ] All charts render with Recharts + correct colors + gradients
- [ ] Score cards count up on mount
- [ ] Pipeline stage bars are correct colors per state
- [ ] Log tab simulates live streaming
- [ ] New Project modal works with animation
- [ ] Settings tabs switch correctly
- [ ] Toggle switches animate smoothly
- [ ] Architecture SVG diagram is real (not placeholder)
- [ ] All animations defined and applied
- [ ] Custom scrollbar applied
- [ ] Fonts loaded (Inter + JetBrains Mono)
- [ ] Grid background overlay on dashboard content area
- [ ] Responsive at 768px+
- [ ] No console errors
- [ ] "Open Dashboard" / "Get Started" switches to dashboard view
- [ ] AutoStack logo in sidebar goes back to landing

---
*AutoStack — Build Prompt v2.0 — Generated from Figma inspection + full spec docs*
*Figma file: 9JFpWctTNtmLSbYvh1knfd | Landing Page node: 2001:67*
