#!/bin/sh
set -e
# Fix data directory ownership after volume mount (volume is owned by root by default)
chown -R node:node /app/data
exec su-exec node node server.js
