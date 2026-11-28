# One folder per computer: what the hub and a server tell each other

Owner decision (2026-11-28): a licence runs one HNMO server folder on one computer; an add-on allows more folders.
The hub has a switch (console, Packages page, "One folder per computer"), **off** while the owner tests.

## Server → hub
- `folder` (top level of the weekly report `POST /api/weekly` and the setup report `POST /api/setup`): 16 hex digits,
  the first 16 of SHA-256(`installId|absolute folder path`); `installId` is random, made once, kept in the folder's save.
  Every program (S6, S9, Arena) of a folder sends the same id. No extra call is made.

## Hub → server
- `limits: { "enforce": boolean }` in the answers of `/api/weekly`, `/api/setup` and `/api/update-check`. Missing = false.
  A server keeps the last value up to 14 days; after that, or when the hub can't be reached, it counts as false.
- Licence payload: optional integer `folders` (1–50, default 1): folders allowed at once on the licensed computer.
  Bought with the "folders" add-on (`addon: "folders"`, `addFolders`), kept through renewals, upgrades and moves.

## What the hub does with it
- `limit-folders/<machine>`: folder ids seen in the last 14 days; more than the licence's `folders` (1 on the free build)
  is flagged.
- `limit-addresses/<hash>`: free computers seen from one public address in the last 14 days; more than one is flagged.
  The address is stored only as a salted hash and never shown.
- Flags are for the owner to read in the console; the owner can set one aside until it grows. Nothing is blocked by the hub.
