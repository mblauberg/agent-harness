# Interactive documents

`html` is static or presentation-only rendered content. An
`interactive-document` adds reader controls such as navigation, search or
filters without becoming an application or processing consequential data. Both
use the `document` profile when the outcome is an audience-ready artifact;
application behaviour or consequential data processing uses `software`.

The profile registry enforces render and audience-fit evidence. It also
requires link-integrity evidence for HTML, and both link-integrity and
interaction-smoke evidence for `interactive-document` artifacts.

If delivery changes build code, styles or runtime behaviour, route that source
slice through `implement`. Interactive documents classify the delivered
artifact with both `generated-artifact` and `source` security surfaces, so the
delivery receipt must retain provenance, secrets-scan and static-analysis
evidence as well as the document profile gates. This composition keeps artifact
acceptance distinct from source-change verification.
