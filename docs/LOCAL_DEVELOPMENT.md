# Local Development

Use Node.js 24 and npm 11 (the repository records npm 11.6.0). With a version manager, `nvm use` selects the Node major in `.nvmrc`.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. To check the foundation:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

No environment file or AI/search credentials are needed. `.env.example` explains the current configuration; Next.js manages `NODE_ENV` for its normal commands. Zod validates that setting in `next.config.ts`, before compilation. Invalid configuration reports field names without logging values. Do not put secrets in variables prefixed with `NEXT_PUBLIC_`.

The homepage is the temporary landing shell. Phase 2 adds a development-only UI preview at `/dev/design-system`; the current preview server runs on port 3102. Use `npm run dev -- --hostname 127.0.0.1 --port 3102` to restart it. The preview returns 404 in production. See `docs/DESIGN_SYSTEM.md` for component contracts and validation.

The 3D agent world slice is at `/lab` (http://127.0.0.1:3102/lab while the preview server runs). It plays the deterministic UAE flagship loop of about 58 seconds with six characters, then restarts. Controls: pause/resume, restart, 1×/2× speed, label toggle, High/Balanced quality, click an agent (or a roster row) to focus it, and confirm the budget prompt early. It uses a prototype simulation; canonical domain state, the event protocol, and AI calls are not implemented yet. Project direction is defined in `docs/MASTER_PROMPT.md`; phase status lives in `docs/BUILD_PROGRESS.md`. The preview input only demonstrates a local callback. Tests cover environment validation, semantic shell content, and important control behavior. Visual and browser checks complement tests; jsdom does not verify WebGL or visual fidelity.

The project has no remote services, database, downloaded fonts, or assets required to render this shell. Dependency installation needs registry access; application rendering does not.
