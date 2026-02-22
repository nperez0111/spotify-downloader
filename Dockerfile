# Build stage for web UI
FROM node:20-alpine as web-ui-builder

WORKDIR /web-ui-build

# Copy web-ui source
COPY web-ui-src .

# Install dependencies and build
RUN npm ci && npm run build && \
    # Cleanup npm cache to reduce layer size
    npm cache clean --force && \
    rm -rf node_modules

# Python dependency builder stage
FROM python:3-alpine as builder

# Install build dependencies
RUN apk add --no-cache --virtual .build-deps \
    g++ \
    git \
    libffi-dev \
    zlib-dev

# Install uv
RUN pip install --upgrade --no-cache-dir pip uv wheel

WORKDIR /app

# Copy source and requirements
COPY . .

# Install spotdl in a virtual environment
RUN uv sync --frozen

# Final runtime stage
FROM python:3-alpine

LABEL maintainer="xnetcat (Jakub)"

# Install only runtime dependencies (no build tools)
RUN apk add --no-cache \
    ca-certificates \
    ffmpeg \
    openssl \
    aria2 \
    py3-cffi \
    libffi && \
    pip install --upgrade --no-cache-dir uv

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy necessary files for runtime
COPY --from=builder /app/spotdl /app/spotdl
COPY --from=builder /app/pyproject.toml /app/pyproject.toml
COPY --from=builder /app/uv.lock /app/uv.lock
COPY --from=builder /app/README.md /app/README.md
COPY --from=builder /app/LICENSE /app/LICENSE

# Copy built web UI from web-ui-builder stage
COPY --from=web-ui-builder /web-ui-build/dist /app/spotdl/web-ui/dist

# Create a volume for the output directory
VOLUME /music

# Change Workdir to download location
WORKDIR /music

# Entrypoint command with Python optimizations
# -O: optimize (removes assert statements)
# -u: unbuffered output
ENV PYTHONOPTIMIZE=2
ENTRYPOINT ["uv", "run", "--project", "/app", "spotdl"]
