/**
 * Where the arrows of a trajectory go (TM4-i, D-157).
 *
 * A trajectory — a hysteresis loop — is drawn in the order the source declared
 * its points, and that order **is** the information: the loading branch and the
 * unloading branch can share an x. The line alone does not say which way it is
 * walked, so small arrowheads are laid along it.
 *
 * This is presentation, like `makeScale` and the ticks in `figureKit`: it works
 * on pixel coordinates that are already projected, only decides where a glyph
 * sits and how it is turned on the screen, and derives no quantity of the data.
 * The order of the points is the backend's; nothing is reordered or added.
 */

export interface PathArrow {
  x: number;
  y: number;
  /** Degrees, 0 = pointing right, clockwise on screen (SVG's `rotate`). */
  angle: number;
}

/**
 * Arrow positions along a pixel polyline, one every `spacing` pixels of path
 * length, the first half a spacing in. A segment shorter than a pixel has no
 * direction and is skipped. A path that never reaches `spacing / 2` still gets
 * one arrow, at the middle of its length, or its direction would not show; a
 * path with less than two distinct points has no arrow at all.
 */
export function arrowsAlong(
  pixels: readonly (readonly [number, number])[],
  spacing = 96,
): PathArrow[] {
  const segments: { x0: number; y0: number; dx: number; dy: number; length: number; start: number }[] =
    [];
  let total = 0;
  for (let i = 1; i < pixels.length; i += 1) {
    const [x0, y0] = pixels[i - 1]!;
    const [x1, y1] = pixels[i]!;
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 1) continue;
    segments.push({ x0, y0, dx: x1 - x0, dy: y1 - y0, length, start: total });
    total += length;
  }
  if (segments.length === 0) return [];

  const at = (distance: number): PathArrow => {
    const segment =
      segments.find((s) => distance <= s.start + s.length) ?? segments[segments.length - 1]!;
    const along = (distance - segment.start) / segment.length;
    return {
      x: segment.x0 + segment.dx * along,
      y: segment.y0 + segment.dy * along,
      angle: (Math.atan2(segment.dy, segment.dx) * 180) / Math.PI,
    };
  };

  const arrows: PathArrow[] = [];
  for (let distance = spacing / 2; distance <= total; distance += spacing) {
    arrows.push(at(distance));
  }
  return arrows.length > 0 ? arrows : [at(total / 2)];
}
