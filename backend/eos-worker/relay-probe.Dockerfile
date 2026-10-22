# Supply game-rust=<game repo>/rust and eos-sdk=<licensed SDK>.
# This target is a disposable qualification tool.
FROM rust:1.96-bookworm AS build
WORKDIR /source
COPY --from=game-rust online_protocol ./online_protocol
COPY --from=game-rust online_protocol_bridge ./online_protocol_bridge
COPY --from=eos-sdk Include /eos/Include
COPY --from=eos-sdk Bin /eos/Bin
COPY backend/eos-worker/tests/relay_probe.cpp /source/relay_probe.cpp
ENV HALO2_EOS_SDK_ROOT=/eos CARGO_BUILD_JOBS=2
RUN cargo build --manifest-path online_protocol_bridge/Cargo.toml --locked --release \
    && c++ -std=c++20 -I online_protocol_bridge/target/cxxbridge -I online_protocol_bridge \
       relay_probe.cpp online_protocol_bridge/target/release/libhalo2_online_protocol_bridge.a \
       -L /eos/Bin -lEOSSDK-Linux-Shipping -lstdc++ -lgcc_s -lutil -lrt -lpthread -lm -ldl \
       '-Wl,-rpath,$ORIGIN' -o /source/eos-relay-probe
FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 probe \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /qualification probe
COPY --from=build /source/eos-relay-probe /usr/local/bin/eos-relay-probe
COPY --from=build /eos/Bin/libEOSSDK-Linux-Shipping.so /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/eos-relay-probe"]
