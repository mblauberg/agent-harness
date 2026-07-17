# Interactive documents

`html` is static or presentation-only rendered content. An
`interactive-document` adds reader controls such as navigation, search or
filters without becoming an application or processing consequential data. Both
use the `document` profile when the outcome is an audience-ready artifact;
application behaviour or consequential data processing uses `software`.

The profile registry enforces render and audience-fit evidence. Also collect
link-integrity evidence for HTML and interaction-smoke evidence for the reader
controls that apply.

If delivery changes build code, styles or runtime behaviour, route that source
slice through `implement` and retain the document profile's render and
audience-fit gates. This composition keeps artifact acceptance distinct from
source-change verification.
