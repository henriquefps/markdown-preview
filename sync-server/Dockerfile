# Local build of the sync server image. Releases use Dockerfile.release,
# which packages the binaries GoReleaser already built.
#
#   docker build -t markdown-preview-sync .
#   docker build --build-arg VERSION=1.2.3 -t markdown-preview-sync .

FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS build
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/markdown-preview-sync . \
 && mkdir -p /out/data

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/markdown-preview-sync /usr/local/bin/markdown-preview-sync
# Owned by the image's non-root user (65532) so a fresh named volume is
# writable. A bind-mounted host directory keeps its host ownership: see
# "Migrating from the Node server" in README.md.
COPY --from=build --chown=65532:65532 /out/data /app/data
WORKDIR /app
ENV PORT=3041 \
    DATA_DIR=/app/data
EXPOSE 3041
VOLUME /app/data
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/markdown-preview-sync"]
CMD ["serve"]
