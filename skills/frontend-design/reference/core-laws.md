# Core design laws

Apply these to both brand and product work. Match implementation complexity to
the aesthetic: maximalism needs elaborate code; minimalism needs precision.

## Colour and theme

- Use OKLCH. Reduce chroma near lightness 0 or 100. Tint neutrals towards the
  brand hue with roughly 0.005–0.01 chroma; never use `#000` or `#fff`.
- Choose a strategy before colours: **Restrained** is tinted neutrals plus one
  accent at no more than 10%; **Committed** lets one saturated colour carry
  30–60%; **Full palette** assigns 3–4 named roles; **Drenched** makes colour
  the surface. Restrained is the product default and brand-minimalism option;
  committed is the identity-led brand default. Do not apply its 10% rule to
  the other strategies.
- Never default to dark or light by category. Write one physical-scene sentence
  naming user, place, ambient light and mood. Add detail until it forces the
  theme, then follow it.

## Type, layout and motion

- Keep body lines at 65–75ch. Establish hierarchy with scale and weight; use at
  least a 1.25 ratio between scale steps.
- Vary spacing for rhythm. Do not wrap everything in containers. Use cards only
  when they are the best affordance; nested cards are always wrong.
- Do not animate layout properties. Ease out with quart, quint or expo curves;
  never bounce or elastic easing.

## Absolute bans

Rewrite any matching element:

- coloured `border-left` or `border-right` stripes over 1px on cards, lists,
  callouts or alerts; use a full border, tint, icon, number or nothing;
- gradient text using `background-clip: text`; use a solid colour, weight or
  size for emphasis;
- decorative/default glassmorphism; use it only when rare and purposeful;
- hero metric plus small label, supporting stats and gradient accent;
- endless identical icon-heading-text card grids; or
- modal as the first solution before inline or progressive alternatives.

## Copy and anti-slop checks

Every word must work. Do not restate headings or add intros that repeat titles.
Use no em dashes or `--` in copy.

Reject work that visibly reads as AI-generated. These bans apply across
registers; each register reference adds its own failures. Run both checks:

1. **First-order:** if category alone predicts theme or palette, such as dark
   blue observability or white-and-teal healthcare, rewrite the scene and
   colour strategy.
2. **Second-order:** if category plus anti-references predicts the aesthetic
   family, such as editorial typography for a non-SaaS-cream AI tool, choose
   again. Use the brand reference's reflex-reject lanes for saturated
   alternatives.
