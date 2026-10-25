# Classic Ludo — Pro Tabletop Edition (v1.1)

A complete, fully playable, offline single-file HTML/CSS/JavaScript classic Ludo game, deeply optimized for the 13-inch iPad Pro in landscape mode.

## Features

- **Pristine 15x15 SVG Board:** Corner bases, star-marked safe zones (indices 1, 9, 14, 22, 27, 35, 40, 48), and center home triangles.
- **Command Stations & HUDs:** Dedicated left/right player panels with interactive tactile 3D dice and Bank Trays.
- **Setup Modal:** Seamlessly choose between 2, 3, or 4 players (inactive players' HUDs hide automatically).
- **Banked Dice Rolls:** Rolling a 6 banks the roll and grants an immediate extra roll without moving tokens yet.
- **3-Six Bust Rule:** Rolling three 6s consecutively busts the turn and clears the bank.
- **Strict FIFO & Full-Bank Lookahead Enforcement (v1.1):** Banked rolls are consumed strictly in FIFO order, and a player must utilize the **entire** banked roll sequence. Partial execution of banked rolls is disallowed: if no legal move sequence can consume all banked rolls, the entire bank is forfeited upfront; if legal full-bank move sequences exist, token choices are constrained to moves that keep the full sequence playable.
- **Capturing & Bonuses:** Capturing an opponent or reaching the center goal awards a bonus roll. Safe zones provide peaceful coexistence.
- **Auto-Play & Highlights:** Single valid moves play automatically; multiple choices trigger animated glow highlights.
- **Cell-by-Cell Animations:** Smooth hopping animations step-by-step with dynamic circular overlap layout when multiple pawns share a square.
- **Synthesized Web Audio SFX:** 100% offline audio using the Web Audio API with an in-game mute toggle.

## Version History

- **v1.1:** Added full-sequence lookahead validation (`canCompleteRollSequence` & `getValidTokensForBankSequence`) so partial banked rolls cannot be played; players either forfeit if the full bank is unplayable or are forced to pick moves that utilize the entire banked sequence.
- **v1:** Initial release of Classic Ludo Pro Tabletop Edition for iPad Pro.

## How to Play on iPad

1. Open the GitHub Pages link in Safari on your iPad.
2. Tap the **Share** button in Safari (square with arrow up).
3. Select **"Add to Home Screen"**.
4. Open the game from your Home Screen to launch in full-screen standalone mode.
