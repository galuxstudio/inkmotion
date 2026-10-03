# Third-party notices

InkMotion bundles the following single-line SVG fonts, unmodified, in `public/fonts/`. They were
taken from the Inkscape extensions repository (`svg_fonts/`, https://gitlab.com/inkscape/extensions).

## EMS fonts: SIL Open Font License 1.1

`EMSAllure.svg`, `EMSElfin.svg`, `EMSFelix.svg`, `EMSReadability.svg`, `EMSReadabilityItalic.svg`

- Single-line versions created by Sheldon B. Michaels; SVG font conversion by Windell H. Oskay
  (Evil Mad Scientist Laboratories).
- EMS Allure is a derivative of *Allura* by Rob Leuschke, TypeSETit.
- EMS Elfin is a derivative of *Mountains of Christmas* by Crystal Kluge, Tart Workshop (the font
  metadata states SIL OFL; Google Fonts lists the original under the Apache License 2.0).
- EMS Felix is a derivative of *Felipa* by Fontstage.
- EMS Readability is a derivative of *Source Sans Pro Light* by Paul D. Hunt, Adobe.

The full licence text is in `public/fonts/OFL.txt`. The fonts may be used, modified and
redistributed with this software, but not sold by themselves.

## Hershey fonts

`HersheyScript1.svg`, `HersheyScriptMed.svg`. Converted to SVG fonts in 2019 by Windell H. Oskay,
www.evilmadscientist.com, adapted from emergent.unpythonic.net/software/hershey by way of
"Hershey Fonts in SVG" by Marty McGuire.

Acknowledgements required by the Hershey font licence:

- The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S.
  National Bureau of Standards.
- The format of the Font data in this distribution was originally created by James Hurt,
  Cognition, Inc., 900 Technology Park Drive, Billerica, MA 01821 (mit-eddie!ci-dandelion!hurt).

## Runtime dependencies

- **Remotion** (https://remotion.dev) is installed via npm and is not redistributed here. It is
  under the Remotion License: free for individuals, non-profits and for-profit organisations
  with up to 3 employees; a company licence is required beyond that. See https://remotion.dev/license.
- Google Fonts used by the `text` layer (Poppins, Anton, Caveat, Bebas Neue, Montserrat,
  Playfair Display) are fetched at render time through `@remotion/google-fonts` and are under
  the SIL Open Font License.
