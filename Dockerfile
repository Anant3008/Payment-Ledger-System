FROM golang:1.21-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN apk add --no-cache git
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/server ./cmd/server

FROM alpine:3.18
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/bin/server /usr/local/bin/server
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/server"]
