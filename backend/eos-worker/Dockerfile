# The licensed SDK stays outside Git. Supply its SDK directory as named context:
# docker buildx build --build-context eos-sdk=/private/path/SDK \
#   -f backend/eos-worker/Dockerfile --target website-api .
FROM rust:1.96-bookworm AS build
ARG CARGO_BUILD_JOBS=2
WORKDIR /source
COPY backend/eos-worker/Cargo.toml backend/eos-worker/Cargo.lock ./
COPY backend/eos-worker/build.rs ./
COPY backend/eos-worker/src ./src
COPY --from=eos-sdk Include /eos/Include
COPY --from=eos-sdk Bin /eos/Bin
ENV HALO2_EOS_SDK_ROOT=/eos
RUN cargo build --locked --release
FROM rust:1.96-bookworm AS security
ARG CARGO_BUILD_JOBS=2
WORKDIR /build
# Explicit source files exclude Cargo targets, local state and credentials from
# this additional context. The master must ship its matching security ABI.
COPY --from=master-rust online_protocol/Cargo.toml online_protocol/Cargo.lock ./rust/online_protocol/
COPY --from=master-rust online_protocol/src ./rust/online_protocol/src
COPY --from=master-rust online_security_ffi/Cargo.toml online_security_ffi/Cargo.lock ./rust/online_security_ffi/
COPY --from=master-rust online_security_ffi/src ./rust/online_security_ffi/src
RUN cargo build --locked --release --manifest-path rust/online_security_ffi/Cargo.toml
# Use the vendor's glibc runtime; Alpine/musl cannot load this library.
FROM node:26.12.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /source/target/release/halo2-eos-worker /usr/local/bin/halo2-eos-worker
COPY --from=build /eos/Bin/libEOSSDK-Linux-Shipping.so /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib
USER 10001:10001
FROM runtime AS website-api
WORKDIR /app
COPY scripts/bridge.ts scripts/eos-service.ts scripts/public-ranks.ts scripts/public-steam.ts scripts/public-friend-tag.ts scripts/status-service.ts scripts/request-budgets.ts scripts/player-search.ts ./scripts/
COPY lib/player-search.ts ./lib/
ENV H2_EOS_WORKER=/usr/local/bin/halo2-eos-worker
EXPOSE 8090
CMD ["node", "scripts/bridge.ts"]
# The master target also needs master-source=game/multiplayer/master_server and
# master-rust=game/rust. The web repo owns deployment glue.
FROM python:3.13-slim-bookworm AS master
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=master-source requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 directory \
    && useradd --uid 10001 --gid 10001 --no-create-home directory \
    && mkdir -p /state/a /state/b && chown -R 10001:10001 /state
COPY --from=master-source *.py retail_gathering.json /app/multiplayer/master_server/
COPY --from=master-source data/retail-launch-2004-rank.json data/title-update-1.5-rank.json /app/multiplayer/master_server/data/
COPY --from=security /build/rust/online_security_ffi/target/release/libhalo2_online_security_ffi.so /app/multiplayer/master_server/
COPY --from=build /source/target/release/halo2-eos-worker /usr/local/bin/halo2-eos-worker
COPY --from=build /eos/Bin/libEOSSDK-Linux-Shipping.so /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    H2_MASTER_STATE=/state H2_MASTER_BIND=0.0.0.0 H2_EOS_WORKER=/usr/local/bin/halo2-eos-worker
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/v1/health',timeout=3).read()"
CMD ["python", "-m", "multiplayer.master_server"]
