# API Reference

All endpoints are rooted at `/api/v1` and return JSON. Every request must include an
`Authorization: Bearer <token>` header. Responses use conventional HTTP status codes: `200` for a
successful read, `201` for a successful create, `400` for a malformed request, `401` when the token
is missing or invalid, `404` when a note does not exist or is not owned by the caller, and `500` for
an unexpected server error.

## List notes

`GET /api/v1/notes` returns the caller's notes, most recently updated first. Supports `?tag=` to
filter by a single tag, `?q=` for a full-text search across title and body, and `?archived=true` to
include archived notes (they are excluded by default). Pagination is cursor based via the `?cursor=`
parameter; the response includes a `nextCursor` field when more results are available.

## Create a note

`POST /api/v1/notes` accepts a JSON body with `title` (required), `body` (required), and `tags` (an
optional array of strings). It returns the created note, including its server-assigned `id` and
`createdAt` timestamp. Titles longer than 200 characters are rejected with `400`.

## Read, update, delete

`GET /api/v1/notes/{id}` returns a single note. `PUT /api/v1/notes/{id}` replaces the title, body,
and tags. `DELETE /api/v1/notes/{id}` permanently removes a note. Archiving — a soft delete that
hides a note from the default list without destroying it — is done with
`POST /api/v1/notes/{id}/archive`.

## Errors

Error responses share a single shape: `{ "error": { "code": "...", "message": "..." } }`. The `code`
is a stable machine-readable string; the `message` is human-readable and may change.
