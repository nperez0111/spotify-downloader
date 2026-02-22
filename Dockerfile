# Build stage for web UI
FROM node:20-alpine as web-ui-builder

WORKDIR /web-ui-build

# Copy web-ui source
COPY web-ui-src .

# Install dependencies and build
RUN npm ci && npm run build

# Final stage
FROM python:3-alpine

LABEL maintainer="xnetcat (Jakub)"

# Install dependencies
RUN apk add --no-cache \
    ca-certificates \
    ffmpeg \
    openssl \
    aria2 \
    g++ \
    git \
    py3-cffi \
    libffi-dev \
    zlib-dev

# Install uv and update pip/wheel
RUN pip install --upgrade pip uv wheel spotipy

# Set workdir
WORKDIR /app

# Copy requirements files
COPY . .

# Install spotdl requirements
RUN uv sync

# Copy built web UI from builder stage
COPY --from=web-ui-builder /web-ui-build/dist ./spotdl/web-ui/dist

# Create a volume for the output directory
VOLUME /music

# Change Workdir to download location
WORKDIR /music

# Entrypoint command
ENTRYPOINT ["uv", "run", "--project", "/app", "spotdl"]
