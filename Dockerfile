FROM golang:1.26.3-alpine AS builder

WORKDIR /src

RUN apk add --no-cache git curl

# Download golang-migrate CLI for automated database migrations in cloud deployments
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then MIGRATE_ARCH="amd64"; elif [ "$ARCH" = "aarch64" ]; then MIGRATE_ARCH="arm64"; else MIGRATE_ARCH="amd64"; fi && \
    curl -L https://github.com/golang-migrate/migrate/releases/download/v4.18.2/migrate.linux-${MIGRATE_ARCH}.tar.gz | tar xvz && \
    mv migrate /migrate

COPY go.mod go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux \
    go build -o server ./cmd/server && \
    go build -o audit-worker ./cmd/audit-worker && \
    go build -o seed ./cmd/seed

FROM alpine:3.18

RUN apk add --no-cache ca-certificates

COPY --from=builder /src/server /server
COPY --from=builder /src/audit-worker /audit-worker
COPY --from=builder /src/seed /seed
COPY --from=builder /migrate /migrate
COPY migrations /migrations
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV GIN_MODE=release

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/server"]
