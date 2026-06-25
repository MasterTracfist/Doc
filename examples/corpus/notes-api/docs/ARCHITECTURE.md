# Architecture

The Notes API is a small, deliberately conventional three-tier service: an HTTP layer, a domain
layer, and a storage layer. Keeping the tiers separate is what lets the service stay stateless and
scale horizontally.

## Request path

An incoming request first passes through authentication middleware, which validates the bearer token
and attaches the resolved owner to the request context. From that point on, every database query is
scoped to that owner, so isolation is enforced in one place rather than scattered across handlers.
The handler validates the payload, calls into the domain layer, and serialises the result.

## Domain layer

The domain layer holds the rules that are not about HTTP or SQL: what makes a note valid, how
archiving differs from deletion, and how tags are normalised (trimmed, lower-cased, de-duplicated).
Keeping these rules out of the handlers means they can be unit tested without a web server and reused
by the background worker.

## Storage

State lives in PostgreSQL. Three tables — `owners`, `notes`, and `tags` — model the data, with a join
table linking notes to tags. Full-text search is backed by a generated `tsvector` column and a GIN
index, refreshed by the worker whenever a note changes.

## Background worker

A separate worker process handles search re-indexing and archival cleanup. Decoupling it from the
request path keeps user-facing latency predictable: a burst of housekeeping can never slow down a
read or a write. The worker coordinates through a database advisory lock so it is safe to run more
than one, even though one is usually enough.
