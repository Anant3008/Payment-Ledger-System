FROM golang:1.26.3-alpine AS builder

WORKDIR /src

RUN apk add --no-cache git

COPY go.mod go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux \
    go build -o server ./cmd/server

FROM alpine:3.18

RUN apk add --no-cache ca-certificates

COPY --from=builder /src/server /server

EXPOSE 8080

CMD ["/server"]