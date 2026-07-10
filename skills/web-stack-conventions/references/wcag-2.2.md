# WCAG 2.2 additions

WCAG 2.2 added nine success criteria and removed 4.1.1 Parsing. Do not report
HTML parsing or duplicate-ID issues as 4.1.1 failures.

- **2.4.11 Focus Not Obscured (Minimum, AA):** keyboard focus must not be
  entirely hidden by sticky bars or overlays. **2.4.12 (Enhanced, AAA):** no
  part may be hidden. Use `scroll-margin-top` or `scroll-margin-bottom` sized to
  the obstruction.
- **2.4.13 Focus Appearance (AAA):** indicator area must equal at least a 2px
  perimeter and contrast at least 3:1 against adjacent colours.
- **2.5.7 Dragging Movements (AA):** provide a single-pointer alternative to
  dragging unless drag is essential.
- **2.5.8 Target Size (Minimum, AA):** targets are at least 24 by 24 CSS px.
  Exceptions include inline text links, browser-default controls, and targets
  whose 24px-diameter circles do not overlap neighbours. 44 by 44 is a comfort
  recommendation, not the AA threshold.
- **3.2.6 Consistent Help (A):** repeated contact, chat or FAQ help stays in the
  same relative order across pages.
- **3.3.7 Redundant Entry (A):** do not require information already supplied in
  the same session; autofill or offer selection. Security reconfirmation and
  expired data are exceptions.
- **3.3.8 Accessible Authentication (Minimum, AA):** a cognitive-function test
  requires an alternative. Permit copy/paste and autofill, or offer passkeys,
  SSO, email links, or object/personal-content recognition. **3.3.9 (Enhanced,
  AAA)** removes the object-recognition exception.
