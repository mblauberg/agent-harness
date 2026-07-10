# OpenAPI 3.1 codegen traps

OpenAPI 3.1 uses JSON Schema 2020-12.

- `nullable: true` is gone. Include `'null'` in a type array, for example
  `type: ['string', 'null']`. A tool emitting `nullable` is producing 3.0.
- Schema objects use the JSON Schema `examples` array, not singular `example`.
  Media-type objects still support `example` and an `examples` map.
- Use top-level `webhooks` for inbound or callback events outside `paths`; do
  not fake them as regular paths.
- Inline keywords include `const`, `if`/`then`/`else`, `prefixItems`,
  `contains`, `$defs`, and type arrays.
- Many generator targets and older `tsoa` versions still assume 3.0, downgrade
  specs, or mishandle type arrays. FastAPI/Pydantic v2 emits 3.1. Validate the
  generated spec with a 3.1-aware Spectral (`spectral:oas`) or Redocly linter
  before trusting SDK output.
- Open maps remain `type: object` plus `additionalProperties: true`. `format`
  remains an annotation unless a validator separately enforces it.
