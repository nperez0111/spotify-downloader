# Web UI Development Guide

This document explains how to edit the web UI and use your custom version with the Docker image.

## Overview

The web UI source code is now included directly in this repository in the `web-ui-src/` directory. All your edits to the web UI are tracked as part of this repo's git history. The Docker build process automatically builds the web UI and includes it in the final image, so any changes you make to the UI code are automatically incorporated when you build a new Docker image.

## Prerequisites

- **For editing the web UI**: Node.js 20+ and npm
- **For testing locally**: The spotdl web server
- **For building with Docker**: Docker and Docker Compose

## Quick Start

### 1. Make Changes to the Web UI

The web UI source code is in the `web-ui-src/` directory:

```
web-ui-src/
├── src/                    # Vue component source files
├── public/                 # Static assets
├── dist/                   # Built output (auto-generated)
├── package.json           # Node.js dependencies
├── vite.config.js         # Build configuration
└── tailwind.config.js     # Tailwind CSS configuration
```

Edit any files in `src/` or `public/` as needed.

### 2. Test Changes Locally (Optional)

Before building the Docker image, you can test your changes locally:

```bash
cd web-ui-src

# Install dependencies (first time only)
npm ci

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Serve the built version locally
npm i -g serve
serve ./dist
```

The development server will typically run on `http://localhost:5173`.

### 3. Build Docker Image with Custom Web UI

After making your changes, rebuild the Docker image:

```bash
docker-compose build --no-cache
```

The `--no-cache` flag ensures the web UI is rebuilt from your latest changes.

### 4. Run the Docker Container

```bash
docker-compose up
```

The web UI will now be served from your custom build. Access it at `http://localhost:8000`.

## File Structure

```
spotify-downloader/
├── web-ui-src/                  # Web UI source code (git repository)
│   ├── src/                     # Vue components and pages
│   ├── public/                  # Static assets
│   ├── dist/                    # Built output (ignored by git)
│   ├── node_modules/            # Dependencies (ignored by git)
│   ├── package.json
│   ├── vite.config.js
│   └── ...
├── spotdl/
│   └── web-ui/                  # Runtime web UI directory
│       ├── dist/                # Built UI (copied by Docker during build)
│       └── ...
├── Dockerfile                   # Updated with web UI build stage
├── docker-compose.yml          # Unchanged
└── WEB_UI_DEVELOPMENT.md       # This file
```

## How It Works

The updated `Dockerfile` uses a multi-stage build:

1. **Stage 1 - Web UI Builder**: 
   - Uses `node:20-alpine` as the base
   - Copies `web-ui-src/` into the builder
   - Runs `npm ci` to install dependencies
   - Runs `npm run build` to create `dist/`
   - Output: Built web UI files in `/web-ui-build/dist/`

2. **Stage 2 - Final Image**:
   - Uses `python:3-alpine` as the base
   - Copies the built web UI from stage 1 to `spotdl/web-ui/dist/`
   - Installs Python dependencies and spotdl
   - The web server automatically uses files from `spotdl/web-ui/dist/`

## Development Workflow

### Local Testing Without Docker

For faster iteration during development:

```bash
# Terminal 1: Start the spotdl web server
spotdl web --host 0.0.0.0 --port 8800 --client-id YOUR_ID --client-secret YOUR_SECRET

# Terminal 2: Start Vite dev server with hot reload
cd web-ui-src
npm run dev
```

Then visit the Vite dev server URL (e.g., `http://localhost:5173`).

### Testing Full Docker Build

```bash
# Build the image
docker build -t spotdl-custom .

# Run the container
docker run -it -p 8000:8800 \
  -e SPOTIFY_CLIENT_ID=YOUR_ID \
  -e SPOTIFY_CLIENT_SECRET=YOUR_SECRET \
  spotdl-custom web --host 0.0.0.0 --port 8800
```

## Git Considerations

The setup is designed to:

- **Track**: All source code in `web-ui-src/` (src/, public/, config files, package.json, etc.)
- **Ignore**: Built output (`web-ui-src/dist/`) and dependencies (`web-ui-src/node_modules/`)

This way, you can:
- Commit all your UI changes directly to this repository
- Keep the repo lean by not storing built/compiled files
- Others can clone this repo and rebuild the UI with `npm run build`

```bash
# Example workflow
cd web-ui-src
# Make changes to src/components/...
git add web-ui-src/
git commit -m "Update web UI component styling"
```

## Troubleshooting

### Docker build fails with "Cannot find module"

Make sure you've properly cloned the web-ui repository:
```bash
git clone https://github.com/spotdl/web-ui.git web-ui-src
```

### Changes not appearing in the web UI

1. Make sure you rebuilt the Docker image: `docker-compose build --no-cache`
2. Make sure you restarted the container: `docker-compose down && docker-compose up`

### Build is taking too long

The first build includes Node.js dependency installation. Subsequent builds will be faster due to Docker layer caching, unless you modify `package.json`.

## Advanced: Pointing to a Different Web UI Build

If you want to use a different web UI repository or build, you can override the location when running spotdl:

```bash
spotdl web --web-gui-location /path/to/custom/ui/dist
```

## Related Documentation

- [spotDL Web UI Repository](https://github.com/spotdl/web-ui)
- [Vite Documentation](https://vitejs.dev/)
- [Vue 3 Documentation](https://vuejs.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
