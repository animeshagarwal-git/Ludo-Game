# Classic Ludo — Pro Tabletop Edition (v3.0)

A complete classic Ludo Progressive Web App (PWA) supporting **Real-Time Online Multiplayer** across devices via shareable Session Links AND **100% Offline Local / AI Play**, scaling seamlessly across iPhones, Android phones (such as Samsung Galaxy S26), iPads & tablets (portrait and landscape), and laptops/desktops.

## Features

- **Real-Time Online Multiplayer Sessions (v3.0):**
  - Host a 2-, 3-, or 4-player online session to generate a **6-character Session ID** and **shareable invite link** (`?room=XXXXXX`).
  - Friends join across iPad, iPhone, Android, or laptop in one tap via the invite link (or by entering the 6-character code).
  - **Hybrid Online + AI Rooms:** Empty seats in 2-, 3-, or 4-player online lobbies can be filled by the Host with **Computer AI** (`Easy`, `Medium`, or `Hard`) — e.g., 2 online friends + 2 Hard AI.
  - **Per-Device Ergonomic Perspective:** Every online player sees their own color anchored to the **Bottom-Right (`br`) thumb zone** on their own screen while staying mathematically synchronized on the authoritative Cloudflare Durable Object server.
  - **Resilient Mobile Reconnect:** Automatically reconnects when returning from iOS/Android share sheets, iMessage, or WhatsApp, with mid-game Host AI rescue if a remote player leaves.
- **Ergonomic Solo-Human Thumb-Zone Seating (v2.3):** Whenever a match has **1 Human player** against AI opponents, the 4-fold symmetric board and command stations automatically orient at match start so the Human player's chosen color anchors to the **Bottom-Right** corner (**bottom-right** in Portrait mode and **right-bottom** in Landscape mode). Rotating the device mid-game between Portrait and Landscape never shifts or swaps board colors. Local Pass & Play matches (2+ Humans) preserve standard tabletop corners.
- **Universal Responsive Layout (v2.2):** Adapts automatically between a 3-column Command Station layout on landscape tablets/laptops/phones and a Top/Bottom Tabletop Stack with an edge-to-edge CSS container-queried square board in portrait mode on phones and tablets, respecting Dynamic Island and camera-cutout safe areas.
- **Pristine 15x15 SVG Board:** Corner bases, star-marked safe zones (indices 1, 9, 14, 22, 27, 35, 40, 48), and center home triangles.
- **Command Stations & HUDs:** Dedicated left/right player panels with role badges (`HUMAN` / `CPU · EASY|MED|HARD`), tactile 3D dice, and Bank Trays.
- **Flexible Human & AI Setup (v2):** Choose 2, 3, or 4 players, switch between **Human + AI** and **All Human** modes, and configure each active station individually as **Human** or **Computer AI** (`Easy`, `Medium`, or `Hard`).
- **3-Tier Computer AI Engine (v2):**
  - **Easy (*Impulsive Rookie*):** High-variance lead-runner play that overlooks threats and frequently misses tactical opportunities.
  - **Medium (*Club Tactician*):** Strong 1-step heuristics prioritizing immediate captures, home goals, base deployment, safe stars, and immediate danger avoidance.
  - **Hard (*Grandmaster Strategist*):** Full multi-roll sequence lookahead across the entire banked turn, discovering `[6, d]` / `[6, 6, d]` combo snipes, spawn-and-snipes, progress-weighted threat deltas, safe-star anchoring, and stalking pressure.
- **Banked Dice Rolls:** Rolling a 6 banks the roll and grants an immediate extra roll without moving tokens yet.
- **3-Six Bust Rule:** Rolling three 6s consecutively busts the turn and clears the bank.
- **Strict FIFO & Full-Bank Lookahead Enforcement (v1.1):** Banked rolls are consumed strictly in FIFO order, and a player must utilize the **entire** banked roll sequence. Partial execution of banked rolls is disallowed: if no legal move sequence can consume all banked rolls, the entire bank is forfeited upfront; if legal full-bank move sequences exist, token choices are constrained to moves that keep the full sequence playable.
- **Capturing & Bonuses:** Capturing an opponent or reaching the center goal awards a bonus roll. Safe zones provide peaceful coexistence.
- **Auto-Play & Highlights:** Single valid moves play automatically; multiple choices trigger animated glow highlights for humans or natural tabletop pacing with selection highlights for AI.
- **Cell-by-Cell Animations:** Smooth hopping animations step-by-step with dynamic circular overlap layout when multiple pawns share a square.
- **Synthesized Web Audio SFX:** 100% offline audio using the Web Audio API with an in-game mute toggle.

## Version History

- **v3.0 (Real-Time Online Multiplayer + Hybrid AI):** Added Cloudflare Workers + SQLite Durable Objects (`LudoRoom` with WebSocket Hibernation & Alarms) powering 6-character Session IDs, instant `?room=XXXXXX` invite links, 2/3/4-player online rooms with optional `Easy`/`Medium`/`Hard` server AI seats, per-device Bottom-Right thumb-zone board perspective, and offline-first PWA preservation.
- **v2.3 (Solo-Human Ergonomic Thumb-Zone Seating — Last Stable Release on `stable`):** Added automatic match-start perspective orientation for solo-Human vs AI games so whichever color the Human selects sits in the **Bottom-Right** corner (bottom-right in Portrait, right-bottom in Landscape, with right-aligned Dice Roll button inside full-width portrait cards), keeping board colors locked across mid-game device rotations.
- **v2.2 (Universal Responsive & Android PWA):** Added adaptive responsive layouts for iPhones & Android phones (portrait & landscape), laptops, and portrait/landscape tablets using CSS Grid, container queries (`cqw`/`cqh`), dynamic viewport units (`dvh`/`dvw`), and `env(safe-area-inset-*)`; unlocked portrait + landscape orientation and split `any`/`maskable` manifest icons for Android Chrome & Samsung Internet.
- **v2.1 (PWA & Offline Airplane Mode):** Added Progressive Web App (PWA) support with custom iPad home screen app icons (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`), a web app manifest (`manifest.webmanifest`), and an offline caching Service Worker (`sw.js`). Adding to the iPad Home Screen gives it a native app icon and enables 100% offline play in Airplane Mode.
- **v2:** Added Computer Players with per-seat Human/AI role selection, `Human + AI` / `All Human` presets across 2-, 3-, and 4-player setups, automated tabletop AI turn pacing, and a 3-tier AI strategy engine (`Easy`, `Medium`, `Hard`).
- **v1.1:** Added full-sequence lookahead validation (`canCompleteRollSequence` & `getValidTokensForBankSequence`) so partial banked rolls cannot be played; players either forfeit if the full bank is unplayable or are forced to pick moves that utilize the entire banked sequence.
- **v1:** Initial release of Classic Ludo Pro Tabletop Edition for iPad Pro.

## How to Install Offline (iPad, iPhone, Android & Desktop)

- **iPad & iPhone (Safari):** Open the GitHub Pages link in Safari -> tap **Share** -> **"Add to Home Screen"** -> tap **Add**.
- **Android / Samsung Galaxy (Chrome or Samsung Internet):** Open the GitHub Pages link -> tap the browser menu (**⋮** or **☰**) -> tap **"Add to Home screen"** / **"Install app"**.
- **Mac & Windows Laptops (Chrome / Edge / Safari):** Click the **Install** icon in the address bar (or **File -> Add to Dock** in macOS Safari).
