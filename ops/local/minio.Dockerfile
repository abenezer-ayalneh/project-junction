# Build the local S3 fixture from official, pinned source releases.
FROM golang:1.24 AS build
ENV CGO_ENABLED=0
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go install github.com/minio/minio@RELEASE.2025-04-22T22-12-26Z
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go install github.com/minio/mc@RELEASE.2025-04-16T18-13-26Z

FROM debian:bookworm-slim
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /go/bin/mc /usr/local/bin/mc
ENTRYPOINT ["minio"]
