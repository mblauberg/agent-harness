# Sources and Source Hierarchy

Use this reference when a project needs explicit style authority or external links.

## Source Hierarchy

1. Follow project-specific style first.
2. Follow product or organisation terminology next.
3. Use this skill for general engineering prose.
4. Use external references below when a rule is unclear or the user asks for authority.

Do not route ordinary engineering prose to another writing skill. This skill is self-contained.

## Style and documentation references

- [Australian Government Style Manual](https://www.stylemanual.gov.au/): the authority for Australian English, dates (`day month year`; numeric `d/m/yyyy`), numbers, plain language, active voice, and acronym expansion. Verify uncertain spelling against the Macquarie Dictionary.
- [Google Developer Documentation Style Guide](https://developers.google.com/style/): clear, consistent developer documentation; terminology, formatting, source hierarchy.
- [Google Technical Writing One](https://developers.google.com/tech-writing/one): defining terms, active voice, short sentences, one idea per sentence.
- [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/): concise sentences, simple words, precise meaning.
- [GitLab Documentation Style Guide](https://docs.gitlab.com/development/documentation/styleguide/): concise, direct, searchable product docs without marketing text.
- [Diataxis](https://diataxis.fr/): separates tutorials, how-to guides, reference, and explanation by reader need.
- [Write the Docs Software Documentation Guide](https://www.writethedocs.org/guide/): community guidance for software documentation.

## Engineering-document standards

Use these when a document type's structure or a rule is challenged. Cite them for authority, not decoration.

- **ISO/IEC/IEEE 29148:2018** (requirements engineering): SRS structure; the nine characteristics of a good requirement (necessary, singular, unambiguous, complete, feasible, verifiable, correct, conforming, appropriate); functional vs quality requirements. See `requirements-and-planning.md`.
- **ISO/IEC 25010** (product quality model): the quality-attribute categories for non-functional requirements (performance efficiency, reliability, security, usability, maintainability, portability, compatibility).
- **INVEST** (Bill Wake): independent, negotiable, valuable, estimable, small, testable user stories. **Given/When/Then** (Gherkin/BDD) for acceptance criteria.
- **ISO/IEC/IEEE 42010:2022** (architecture description): stakeholders, concerns, viewpoints, and views. See `architecture-and-presentations.md`.
- **C4 model** (Simon Brown, [c4model.com](https://c4model.com/)): context, container, component, code views for pragmatic architecture diagrams.
- **ADR** (Michael Nygard, [adr.github.io](https://adr.github.io/)): title, status, context, decision, consequences.
- **ISO/IEC/IEEE 12207** and **IEEE 1058**-style planning: software life-cycle and project-plan content, sized to the project.
- **Assertion-evidence** ([assertion-evidence.com](https://www.assertion-evidence.com/)): one sentence-assertion per slide, supported by visual evidence, for non-technical presentations.
- **PMI power/interest grid and RACI**: stakeholder prioritisation and role clarity.
- **Three-point / PERT estimation and the cone of uncertainty** (Steve McConnell, *Software Estimation*): estimates as ranges that narrow over time.
- **Keep a Changelog** ([keepachangelog.com](https://keepachangelog.com/)): changelog structure (Added/Changed/Deprecated/Removed/Fixed/Security), for humans not machines, ISO dates.
- **Google SRE Book, Postmortem Culture** ([sre.google/sre-book/postmortem-culture](https://sre.google/sre-book/postmortem-culture/)): blameless postmortems, triggers, review discipline; example postmortem in Appendix D. **PagerDuty postmortem guide** ([postmortems.pagerduty.com](https://postmortems.pagerduty.com/)): what/how not why, forward-built timelines.
- **Mozilla bug-writing guidelines** ([bugzilla.mozilla.org](https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html)): minimal reproduction, one bug per report, expected versus actual.
- **GitHub contributor guidelines** ([docs.github.com](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)): CONTRIBUTING doc conventions.
- **Wikipedia, Signs of AI writing** ([WP:SIGNS](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)): the maintained community catalogue of AI-writing tells; useful when a tell is challenged.

## When to Link Sources in Output

Link sources when:

- the user asks for source-backed guidance
- the text states a style rule that might be challenged
- project documentation needs an explicit style basis
- you are resolving a conflict between style conventions

Do not add source links to ordinary commit messages, comments, UI text, or error messages.

## Conflict Resolution

- If a project style guide conflicts with this skill, follow the project and note the trade-off only when it matters.
- If an API, framework, product, or quoted source uses US spelling, preserve it exactly.
- If legal, academic, or domain-specific writing rules apply, preserve their required terminology and citation format.
- If a source is needed but unavailable, use `[FLAG: verify source]` rather than inventing support.
