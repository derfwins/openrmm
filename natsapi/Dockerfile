FROM golang:1.21-alpine

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY natsapi/ .
RUN go build -o /natsapi

EXPOSE 8090

CMD ["/natsapi"]