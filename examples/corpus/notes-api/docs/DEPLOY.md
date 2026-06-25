# Deployment Guide

The Notes API ships as a single container image and is configured entirely through environment
variables, so the same image runs unchanged in local development, staging, and production.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP listen port | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | — (required) |
| `TOKEN_SECRET` | Secret used to validate bearer tokens | — (required) |
| `LOG_LEVEL` | `debug`, `info`, `warn`, or `error` | `info` |

Secrets must never be baked into the image. Inject them at runtime through your orchestrator's secret
store. The service refuses to start if `DATABASE_URL` or `TOKEN_SECRET` is missing, which turns a
misconfiguration into an immediate, obvious failure rather than a subtle runtime error.

## Running locally

Bring up a PostgreSQL instance, export the required variables, run the migrations, and start the
server. A `docker-compose.yml` is provided that wires the API to a throwaway database for
development.

## Running in production

Run at least two instances behind a load balancer so a single crash never takes the service down.
Point all instances at the same database. Run exactly one worker process for re-indexing and archival
cleanup; running more than one is safe but wasteful because the jobs coordinate through an advisory
lock. Health is reported at `GET /healthz`, which checks database connectivity and returns `200` only
when the instance is ready to serve traffic — wire it to your load balancer's health check.

## Upgrades

Migrations are forward-only and run automatically on start. Deploy with a rolling strategy so old and
new instances briefly coexist; the schema changes are written to remain compatible across one
version, which makes zero-downtime deploys possible.
