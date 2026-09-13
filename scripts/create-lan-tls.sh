#!/bin/sh
set -eu

lan_ip=${1:?Usage: sh scripts/create-lan-tls.sh <LAN_IP>}
umask 077
mkdir -p .local-tls
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout .local-tls/key.pem -out .local-tls/cert.pem \
  -subj "/CN=$lan_ip" -addext "subjectAltName=IP:$lan_ip,DNS:localhost"
