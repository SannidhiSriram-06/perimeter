# Perimeter dashboard

React + Vite + TypeScript shell. Everyone's views plug into this app (Sriram owns the shell).

**Status:** login, session handling, role-guarded routes and the typed API client are built and tested (8 tests). `AdminHome` and `TeamHome` are placeholders; the incident list, blast-radius view, claims with evidence, leave management and directory screens are not built yet. The BFF has no edit-and-finalize endpoint yet. Screens are specified in [docs/wireframes](../../docs/wireframes/README.md).

## Run

```bash
cd services/dashboard
npm install
npm run dev        # http://localhost:5173 (the BFF only allows CORS from this origin)
```

Start the BFF first (`services/bff-server`, port 3001, database seeded). Dev users: `10001` (admin) and `100101` (team member), password `perimeter-dev`. Set `VITE_API_URL` (see `.env.example`) if the BFF is elsewhere.

```bash
npm test           # vitest
npm run build      # type-check + production build
```

## Layout

- `src/api/client.ts`: typed `api<T>(path, init)`; attaches the Bearer token, clears the session on a 401. Add your endpoint helpers here or in a new file under `src/api/`.
- `src/auth/`: `AuthProvider` / `useAuth()` (token and role kept in `sessionStorage`) and `RequireRole` (route guard).
- `src/pages/`: one file per page. `AdminHome` and `TeamHome` are placeholders to replace.
- `src/App.tsx`: the route table.

## Add a page

1. Create `src/pages/MyPage.tsx`.
2. In `src/App.tsx`, add `<Route path="/admin/my-page" element={<MyPage />} />` inside the `RequireRole role="admin"` group (or `team_member`).
3. Fetch with `api<MyType>('/api/v1/...')`. Render only what the API returns: the guard is a UX convenience, the BFF enforces authorization.

Login failures always show "Invalid credentials", never whether an ID exists.
