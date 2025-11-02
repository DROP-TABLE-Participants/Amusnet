# Shadow Shapes Race

Shadow Shapes Race is a side-view shadow matching sprint for up to three mobile players. A lightweight WebSocket server drives the session state, while the desktop view stays in spectator mode, showing every lane and target ghost in real time.

## Features

- Split-screen layout: three fixed lanes rendered with a lateral camera so silhouettes read clearly
- Mobile-only gyro control with server-side validation; desktop clients are read-only spectators
- WebSocket voting: as soon as two players join and both hit **Ready**, a random shape & target orientation are broadcast
- Server-tracked progress, angle deltas, and finish locks to keep every viewer in sync

## Getting Started

```bash
npm install
npm run dev      # runs Vite client + websocket server (port 8787)
```

Open `http://localhost:5173` on a desktop or laptop for the spectator view. Mobile players scan the same URL and tap **Join race** to occupy open slots.

### Production Build & Linting

```bash
npm run build    # type-checks and outputs production assets
npm run lint     # ESLint with TypeScript support
```

## How Rounds Work

1. Mobile players tap **Join race** and grant motion/orientation permission on iOS if prompted.
2. When at least two players have joined, each taps **Ready to start**. The server rolls a random shape and orientation and begins the race.
3. Players rotate their phone to align the live model with the translucent ghost; the server tracks angle deltas and locks a lane once it is within threshold.
4. After all active lanes lock, the round ends and players can vote again for the next randomized target.

## Mobile vs Desktop

- **Mobile**: Full gyro control streamed via WebSocket, ready/unready buttons, and the ability to leave/rejoin slots.
- **Desktop**: Spectator-only; displays every lane, progress bar, and current target without accepting input.

## Tech Stack

- React 19 + TypeScript powered by Vite
- `@react-three/fiber`, `@react-three/drei`, `three` for rendering
- WebSocket backend (`ws`, `tsx`, `nanoid`) handling session state and gyro updates
- Zustand client store mirroring server payloads
- Optional generative shape pipeline powered by the OpenAI Responses API

All assets are procedural geometries, so loads stay light and every new round feels instant.

## Autogenerating Shape Silhouettes with ChatGPT

You can refresh the three racing silhouettes at any time via the `generate:shapes` script. Provide your OpenAI API key (and optionally a custom `OPENAI_MODEL`) through the environment, then run:

```bash
OPENAI_API_KEY=sk-... npm run generate:shapes
```

The script asks ChatGPT to design three distinct silhouettes using basic primitives and writes the results to `src/generated/shapes.ts`. Restart the dev server (or let Vite reload) to see the new lane geometry. Keep your key out of version control—store it in a personal `.env` file that you do not commit.

## Docker Images

Two Dockerfiles are included for production deployments:

- `Dockerfile.client` builds the static Vite bundle and serves it from Nginx.
- `Dockerfile.server` packages the WebSocket backend using `npx tsx server/index.ts`.

Example build commands:

```bash
docker build -t shadow-play-client -f Dockerfile.client .
docker build -t shadow-play-server -f Dockerfile.server .
```

The client container exposes port `80`; the server container exposes port `8787`. Supply a custom WebSocket endpoint by either

1. Setting `VITE_WS_URL` during the client build, or
2. Injecting `<meta name="shadow-play:ws-url" content="ws://your-host:8787" />` at runtime (for example via your HTML template) or by defining `window.__SHADOW_PLAY_WS_URL` before the bundle executes.

When running inside Docker no local TLS certificates are required—the dev HTTPS configuration now activates only when `WS_SSL_KEY`/`WS_SSL_CERT` point to readable files, so containers default to plain HTTP/WebSocket.
