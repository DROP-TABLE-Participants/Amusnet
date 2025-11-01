## Shadow Shapes Race
- **Objective**: Multiplayer shadow-matching race; desktop (`/`) runs the host/spectator dashboard, mobile (`/join`) streams gyro input through WebSocket snapshots.
- **State Contract**: `src/shared/messages.ts` defines every payload; update server snapshots, Zustand store, and message unions in tandem.
- **Client Store**: `src/state/useSessionStore.ts` manages the socket, throttles `orientation` writes with `requestAnimationFrame`, and refreshes the shape registry after each server tick.
- **Orientation Flow**: First quaternion per slot calibrates baseline; subsequent updates compare against `Session.targetQuaternion` using `shadowAngleBetween` in `src/utils/quaternion.ts`.
- **Rendering Stack**: `components/PlayerLane` pulls meshes from `getShapeDefinition` (`src/shapes/catalog.ts`) to swap generated silhouettes, decoys, and the finale model.
- **Countdown UX**: `hooks/useShapeSlotSpinner` feeds `SlotTicker` with decoy IDs, locking onto `targetShapeId` as the countdown approaches zero.
- **Results View**: `components/ResultsDashboard` builds the scoreboard (filtering empty slots) and displays the finale multiplier supplied by the server payload.

## Server Runtime
- **Entry Point**: `server/index.ts` spins up the WebSocket server (HTTP or HTTPS) and holds a singleton `Session` that owns lobby state, timers, and round transitions.
- **Lobby States**: Expect `waiting → countdown → active → complete`; the server advances rounds after `ROUND_TRANSITION_DELAY_MS` once winners are resolved or the timer expires.
- **Match Logic**: `MATCH_THRESHOLD` (0.35 radians) awards a win; `clampProgress` turns angular delta into the UI progress bar.
- **Scoring**: Round winners earn 1 point; the finale (`FINAL_SHAPE_ID`) multiplies by `finalRoundMultiplier` before the scoreboard renders.
- **Shape Pipeline**: `server/shapeGenerator.ts` and `scripts/generateShapes.ts` call the OpenAI Responses API (`OPENAI_API_KEY`, optional `OPENAI_MODEL`) and normalize output with fallback IDs.
- **Generated Assets**: Treat `src/generated/shapes.ts` as generated—regenerate via the script, don’t hand-edit.
- **Logging**: Toggle verbose traces with `DEBUG_SHADOW_PLAY=1`; console entries are prefixed `[shadow-play]` for easy filtering.

## Development Workflow
- **Dev Stack**: `npm run dev` launches Vite (`npm:dev:client`) and the WebSocket server (`npm:dev:server`) via `concurrently`; stop both before restarting to avoid ghost sockets.
- **TLS for Gyro**: Mobile Safari needs HTTPS for `DeviceOrientationEvent`; `vite.config.ts` reads certs from `WS_SSL_KEY`/`WS_SSL_CERT` or a local fallback. Supply trusted certs for real devices.
- **WebSocket URL**: The client derives the endpoint from `VITE_WS_URL` (override) or `VITE_WS_PORT`; keep the server `PORT` env aligned.
- **Build & Lint**: `npm run build` runs the TypeScript project references before bundling; `npm run lint` uses the flat config in `eslint.config.js`.
- **Shape Generation Script**: Run `OPENAI_API_KEY=… npm run generate:shapes` and redirect stdout into `src/generated/shapes.ts` to refresh silhouettes.
- **Hot Reload Limits**: Three.js materials persist across reloads; restart Vite if shader or material helpers misbehave.
- **Manual QA**: No automated tests—validate changes by simulating races and watching orientation logs from `PlayerLane` and `quaternion.ts`.

## Conventions & Tips
- **Routing**: React Router v6 is minimal; add screens in `App.tsx` and gate spectator-only UI with `useSessionStore`’s `device` value.
- **Styling**: Core layout styles live in `src/App.css` and `src/index.css`; lane states rely on class names like `lane-self` or `lane-winner`—keep variants in sync.
- **Shared Utilities**: Quaternion helpers in `src/utils/quaternion.ts` are single-source; update both client and server when adjusting orientation math.
- **Cleanup Patterns**: Hooks starting timers/RAF (`useShapeSlotSpinner`, motion listeners) cancel on unmount; follow the same pattern when adding realtime behavior.
- **Extending Messages**: Add new commands by updating the `ClientMessage`/`ServerMessage` unions and wiring handlers in both `Session.handleMessage` and the Zustand store.
- [x] Verify that the copilot-instructions.md file in the .github directory is created. (Completed by creating the checklist file.)

- [x] Clarify Project Requirements (User requested a Three.js React experience for the Shadow Shapes Race game.)

- [x] Scaffold the Project (Initialized Vite React TypeScript app with npm and installed dependencies.)

- [x] Customize the Project (Rebuilt Shadow Shapes Race with a WebSocket backend, mobile-only gyro control, and a minimalist three-lane spectator view.)

- [x] Install Required Extensions (No workspace-specific extensions requested.)

- [x] Compile the Project (npm run build + npm run lint succeed.)

- [x] Create and Run Task (Added .vscode/tasks.json with a dev task and ran it once.)

- [x] Launch the Project (Verified `npm run dev` brings up Vite + WebSocket stack.)

- [x] Ensure Documentation is Complete (README refreshed for WebSocket flow; checklist cleaned.)
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
