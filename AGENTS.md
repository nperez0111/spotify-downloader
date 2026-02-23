# spotDL Project Structure for Agents

A Spotify playlist downloader that finds songs on YouTube and downloads them with metadata.

## Project Overview

- **Language**: Python 3.10+
- **Main Package**: `spotdl/`
- **Web UI**: Vue.js (TypeScript) in `web-ui-src/`
- **Build System**: `uv` with `pyproject.toml`
- **Tests**: pytest in `tests/`

## Core Modules

### `spotdl/console/`
CLI entry points and command handlers. Key files:
- `entry_point.py` - Main CLI argument parsing and command routing
- `download.py` - Download command handler
- `sync.py` - Sync command for playlists
- `web.py` - Web UI server setup
- `meta.py` - Metadata management commands
- `save.py` - Save/export commands
- `url.py` - URL parsing commands

### `spotdl/download/`
Core download logic. Files:
- `downloader.py` - Main downloader orchestrator, handles parallel downloads, retries, and progress
- `progress_handler.py` - Progress tracking and display (uses rich library)

### `spotdl/providers/`
Pluggable providers for finding audio and lyrics.

#### `spotdl/providers/audio/`
Audio source providers (YouTube, YouTube Music, SoundCloud, etc.):
- `base.py` - Abstract base class for audio providers
- `youtube.py` - YouTube search/download
- `ytmusic.py` - YouTube Music search
- `piped.py` - Piped (privacy-focused) search
- `bandcamp.py` - Bandcamp search
- `soundcloud.py` - SoundCloud search
- `sliderkz.py` - Slider.kz search

#### `spotdl/providers/lyrics/`
Lyrics providers:
- `base.py` - Abstract base class
- `genius.py` - Genius lyrics
- `azlyrics.py` - AZLyrics search
- `musixmatch.py` - Musixmatch search
- `synced.py` - Synced lyrics provider

### `spotdl/types/`
Data models for domain objects:
- `song.py` - Song metadata and operations (embedding, downloading)
- `playlist.py` - Playlist metadata
- `album.py` - Album metadata
- `artist.py` - Artist metadata
- `options.py` - Download/search options (DownloaderOptions, etc.)
- `result.py` - Download result info
- `saved.py` - Saved/archived metadata

### `spotdl/utils/`
Utility functions and integrations:
- `arguments.py` - CLI argument definitions and parsing
- `config.py` - Configuration file handling
- `search.py` - Query parsing and search coordination
- `spotify.py` - Spotify API client wrapper (spotipy integration)
- `matching.py` - Song matching algorithm (find best YouTube match)
- `metadata.py` - Metadata tag writing (mutagen integration)
- `ffmpeg.py` - FFmpeg wrapper for audio conversion
- `formatter.py` - Output formatting/templates
- `archive.py` - Download archive tracking
- `m3u.py` - M3U playlist generation
- `lrc.py` - LRC lyrics file generation
- `logging.py` - Logging setup
- `github.py` - GitHub update checking
- `static.py` - Static constants and config
- `web.py` - Web server utilities (FastAPI integration)
- `console.py` - Console output helpers
- `downloader.py` - Downloader instantiation helper

### `spotdl/__init__.py`
Main `Spotdl` class - public API for programmatic use. Also exports `console_entry_point`.

## Web UI (`web-ui-src/`)

Vue.js + Vite frontend for web interface:
- `src/main.js` - Entry point
- `src/App.vue` - Root component
- `src/views/` - Page components
- `src/components/` - Reusable UI components
- `src/model/` - API client and state management
- `src/assets/` - Static assets
- `src/router/` - Vue Router setup
- Build output: `dist/`

## Tests (`tests/`)

Pytest structure mirroring source:
- `conftest.py` - Shared fixtures
- `test_init.py` - Package initialization tests
- `test_main.py` - Main entry point tests
- `test_matching.py` - Song matching algorithm tests
- `console/` - CLI tests
- `utils/` - Utility function tests
- `providers/` - Provider tests
- `types/` - Type/model tests

## Key Dependencies

**Audio/Search**: spotipy (Spotify), yt-dlp (YouTube), ytmusicapi (YT Music), pytube (fallback)
**Lyrics**: syncedlyrics, requests, beautifulsoup4
**Metadata**: mutagen (tag writing), rapidfuzz (fuzzy matching), python-slugify
**Web**: fastapi, uvicorn, pydantic, websockets
**Text Processing**: rich (CLI formatting), unidecode
**System**: platformdirs (config paths)

## Configuration & Entry Points

- CLI entry: `spotdl:console_entry_point` (from `spotdl/__init__.py`)
- Config location: Platform-dependent via `platformdirs` (Linux: `~/.config/spotdl/`)
- Web server: Served via FastAPI on configurable port
- FFmpeg: Can be auto-downloaded or system-provided

## Build & Documentation

- **Build system**: `uv` (defined in pyproject.toml)
- **Documentation**: mkdocs in `docs/`, built to ReadTheDocs
- **Docker**: Dockerfile and docker-compose.yml provided
- **Build script**: `scripts/build.py` for creating executables with PyInstaller
