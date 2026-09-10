# The 3rD Lens — Pro-Grade Drone Mapping

A production-grade landing page and upload pipeline for drone-based 3D reconstruction.

## Quick Start

```bash
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page.
Navigate to `/upload` for the upload interface.

## Backend Integration

The frontend is designed to work with a FastAPI backend that handles drone video processing, 3D model generation, and pipeline orchestration.

### Current Status

**Backend is inactive by default.** The app runs in demo mode with simulated upload progress and mock pipeline stages. No backend is required to develop or preview the frontend.

### Environment Variables

`.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_API_ACCESS_KEY=
NEXT_PUBLIC_BACKEND_ACTIVE=false
```

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:5000` |
| `NEXT_PUBLIC_API_ACCESS_KEY` | Shared secret key for auth | `""` |
| `NEXT_PUBLIC_BACKEND_ACTIVE` | Enable real backend calls | `false` |

### How to Activate the Backend

1. **Set `NEXT_PUBLIC_BACKEND_ACTIVE=true`** in `.env.local`:

   ```env
   NEXT_PUBLIC_BACKEND_ACTIVE=true
   ```

2. **Start the backend** on `http://localhost:5000` (or update `NEXT_PUBLIC_API_URL`).

3. **Set `NEXT_PUBLIC_API_ACCESS_KEY`** to match your backend's expected access key.

4. Restart the dev server: `pnpm run dev`.

### API Endpoints Expected

When `BACKEND_ACTIVE=true`, the frontend calls:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/auth` | POST | Authenticate and receive a JWT token |
| `/api/v1/upload/init` | POST | Initialize a chunked upload session |
| `/api/v1/upload/chunk` | POST | Upload a single chunk (8 MB each) |
| `/api/v1/upload/complete` | POST | Finalize upload and start pipeline |
| `/api/v1/status/:jobId` | GET | Poll pipeline status |

The backend also exposes a WebSocket at the same URL for real-time status updates via `status_update` events.

### What Happens in Demo Mode

When `BACKEND_ACTIVE=false`:

- **Auth**: `fetchToken()` returns a placeholder `"demo-token"` — no network call.
- **Upload**: Form simulates a 3-second progress bar, then transitions to processing.
- **Processing**: Status monitor simulates Dust3R, SAM2, training, and export stages with the same progress messages shown by the pipeline.
- **Complete**: Displays simulated metrics and loads the bundled sample GLB in the 3D viewer.
- **No errors**: All backend failures are gracefully handled.

### Enabling for Production

For a real deployment, set these in your hosting platform (Vercel, etc.):

```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_API_ACCESS_KEY=your-secret-key-here
NEXT_PUBLIC_BACKEND_ACTIVE=true
```

## Project Structure

```
thirdlens/
├── app/
│   ├── page.tsx              # Landing page (frame sequencer, hero, features, CTA)
│   └── upload/
│       └── page.tsx          # Upload pipeline page (split layout)
├── components/
│   ├── frame-sequencer/      # Canvas-based 415-frame scroll animation
│   ├── hero-overlay/         # Title + tagline overlay
│   ├── features/             # 4-card capabilities grid
│   ├── scan-stories/         # 3 alternating SVG animation panels
│   ├── cta/                  # Final CTA section
│   ├── grid-overlay/         # Structural grid lines
│   ├── upload-form.tsx       # Multi-file chunked upload form
│   ├── status-monitor.tsx    # Socket.io + poll status display
│   └── viewer-3d.tsx         # R3F 3D model viewer with measurement
├── lib/
│   └── api.ts                # API helpers, auth, BACKEND_ACTIVE flag
├── public/
│   ├── frame_001.webp        # 148 scroll frames (Earth → wireframe city)
│   └── ...
├── .env.local                # Environment configuration
└── package.json
```

## Tech Stack

- **Framework**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4, CSS custom properties, styled-jsx
- **3D Viewer**: Three.js, @react-three/fiber, @react-three/drei
- **Animation**: HTML5 Canvas frame sequencer, CSS keyframes
- **Upload**: Chunked upload with axios, socket.io-client for status
- **Icons**: lucide-react
