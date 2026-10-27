# Accessibility plan

- **Text mode with parity.** Same renderer as the 3D task panel, so every objective, task and assessment decision is the same (tested in `tests/functional.spec.js`, "text mode parity"). The 3D loop pauses in text mode.
- **No WebGL needed.** The task panel works without the canvas; a WebGL fallback message points to it.
- **Photos.** Every photo has detailed alt text describing the change evidence, plus date, photographer and licence in a caption.
- **Time slider.** Native range input, arrow keys step by date, `aria-valuetext` reads the date and the published retreat figure.
- **Swipe compare.** Range input in 10 % steps plus preset buttons (all 1941 / half / all 2004), the 0/50/100 steps from plan §11.
- **Measurement.** Two range inputs (100 m steps, Page Up/Down 1 km) and shortcut buttons; the readout is a polite live region.
- **Charts.** The rate chart is an SVG with title and description, and a data table with the same values.
- **Sorting and ordering.** Radio groups per card; the succession order uses Earlier/Later buttons, not drag and drop.
- **Cinematics.** Captions, text description, skip (button + Esc), reduced-motion stills (system preference or Settings toggle); never during assessment.
- **Testing.** axe (WCAG 2.1 A/AA tags) on the overlay, dialogs, and all five modules in both the panel and text mode, including answered states: zero critical/serious. Screen-reader testing with real assistive technology has not been done; full WCAG validation needs manual testing and expert review.
