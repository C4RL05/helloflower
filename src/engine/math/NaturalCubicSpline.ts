import { Vector3 } from "three";
import { Mathf } from "./Mathf";

/**
 * Faithful port of Unity `NaturalCubicSpline.cs`.
 *
 * Originally ported (in the Unity project) from:
 *   http://www.cse.unsw.edu.au/~lambert/splines/NatCubic.java
 *   http://en.nicoptere.net/?p=210
 *
 * Computes a natural cubic spline through the control points, then resamples it
 * to a FIXED number of points (`steps`) distributed proportionally to each
 * segment's measured arc length. The arc-length measurement and the
 * `FloorToInt` point distribution are intentionally reproduced exactly — the
 * resulting point count/positions are sensitive to this and must match the
 * original for petal geometry fidelity.
 */
class Cubic {
  /** a + b*u + c*u^2 + d*u^3 */
  constructor(
    private readonly a: number,
    private readonly b: number,
    private readonly c: number,
    private readonly d: number,
  ) {}

  eval(u: number): number {
    return ((this.d * u + this.c) * u + this.b) * u + this.a;
  }
}

export class NaturalCubicSpline {
  readonly steps: number;
  readonly closed: boolean;

  constructor(steps: number, closed: boolean) {
    this.steps = steps;
    this.closed = closed;
  }

  private calcNaturalCubic(n: number, x: number[]): Cubic[] {
    const gamma = new Array<number>(n + 1).fill(0);
    const delta = new Array<number>(n + 1).fill(0);
    const D = new Array<number>(n + 1).fill(0);

    gamma[0] = 1 / 2;
    for (let i = 1; i < n; i++) {
      gamma[i] = 1 / (4 - gamma[i - 1]);
    }
    gamma[n] = 1 / (2 - gamma[n - 1]);

    delta[0] = 3 * (x[1] - x[0]) * gamma[0];
    for (let i = 1; i < n; i++) {
      delta[i] = (3 * (x[i + 1] - x[i - 1]) - delta[i - 1]) * gamma[i];
    }
    delta[n] = (3 * (x[n] - x[n - 1]) - delta[n - 1]) * gamma[n];

    D[n] = delta[n];
    for (let i = n - 1; i >= 0; i--) {
      D[i] = delta[i] - gamma[i] * D[i + 1];
    }

    const cubic = new Array<Cubic>(n);
    for (let i = 0; i < n; i++) {
      cubic[i] = new Cubic(
        x[i],
        D[i],
        3 * (x[i + 1] - x[i]) - 2 * D[i] - D[i + 1],
        2 * (x[i] - x[i + 1]) + D[i] + D[i + 1],
      );
    }
    return cubic;
  }

  private calcClosedNaturalCubic(n: number, x: number[]): Cubic[] {
    const w = new Array<number>(n + 1).fill(0);
    const v = new Array<number>(n + 1).fill(0);
    const y = new Array<number>(n + 1).fill(0);
    const D = new Array<number>(n + 1).fill(0);
    let z: number, F: number, G: number, H: number;

    w[1] = v[1] = z = 1 / 4;
    y[0] = z * 3 * (x[1] - x[n]);
    H = 4;
    F = 3 * (x[0] - x[n - 1]);
    G = 1;
    for (let k = 1; k < n; k++) {
      v[k + 1] = z = 1 / (4 - v[k]);
      w[k + 1] = -z * w[k];
      y[k] = z * (3 * (x[k + 1] - x[k - 1]) - y[k - 1]);
      H = H - G * w[k];
      F = F - G * y[k - 1];
      G = -v[k] * G;
    }
    H = H - (G + 1) * (v[n] + w[n]);
    y[n] = F - (G + 1) * y[n - 1];

    D[n] = y[n] / H;
    /* This equation is WRONG! in my copy of Spath (per original comment) */
    D[n - 1] = y[n - 1] - (v[n] + w[n]) * D[n];
    for (let k = n - 2; k >= 0; k--) {
      D[k] = y[k] - v[k + 1] * D[k + 1] - w[k + 1] * D[n];
    }

    const cubic = new Array<Cubic>(n + 1);
    for (let k = 0; k < n; k++) {
      cubic[k] = new Cubic(
        x[k],
        D[k],
        3 * (x[k + 1] - x[k]) - 2 * D[k] - D[k + 1],
        2 * (x[k] - x[k + 1]) + D[k] + D[k + 1],
      );
    }
    cubic[n] = new Cubic(
      x[n],
      D[n],
      3 * (x[0] - x[n]) - 2 * D[n] - D[0],
      2 * (x[n] - x[0]) + D[n] + D[0],
    );
    return cubic;
  }

  /**
   * Performs the natural cubic spline transformation.
   * Returns `steps` evenly-arc-length-distributed points, or null for n < 2.
   */
  eval(controlPoints: Vector3[]): Vector3[] | null {
    const n = controlPoints.length;
    if (n < 2) return null;

    const xpoints = new Array<number>(n);
    const ypoints = new Array<number>(n);
    const zpoints = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      xpoints[i] = controlPoints[i].x;
      ypoints[i] = controlPoints[i].y;
      zpoints[i] = controlPoints[i].z;
    }

    const cubicCount = n - 1;
    let cubicX: Cubic[], cubicY: Cubic[], cubicZ: Cubic[];

    if (this.closed) {
      cubicX = this.calcClosedNaturalCubic(cubicCount, xpoints);
      cubicY = this.calcClosedNaturalCubic(cubicCount, ypoints);
      cubicZ = this.calcClosedNaturalCubic(cubicCount, zpoints);
    } else {
      cubicX = this.calcNaturalCubic(cubicCount, xpoints);
      cubicY = this.calcNaturalCubic(cubicCount, ypoints);
      cubicZ = this.calcNaturalCubic(cubicCount, zpoints);
    }

    // Distance between control points (arc length per segment).
    const controlPointDistances = new Array<number>(cubicCount).fill(0);
    let distanceTotal = 0;
    for (let i = 0; i < cubicCount; i++) {
      const cX = cubicX[i];
      const cY = cubicY[i];
      const cZ = cubicZ[i];

      let distance = 0;
      const distanceStep = 0.05;
      let lastPoint = new Vector3(cX.eval(0), cY.eval(0), cZ.eval(0));

      for (let j = distanceStep; j <= 1; j += distanceStep) {
        const nextPoint = new Vector3(cX.eval(j), cY.eval(j), cZ.eval(j));
        distance += lastPoint.distanceTo(nextPoint);
        lastPoint = nextPoint;
      }

      controlPointDistances[i] = distance;
      distanceTotal += distance;
    }

    // Spline points.
    const splinePoints = new Array<Vector3>(this.steps);
    splinePoints[0] = new Vector3(
      cubicX[0].eval(0),
      cubicY[0].eval(0),
      cubicZ[0].eval(0),
    );

    let splineIndex = 1;
    let cubicStepsCount = 0;
    for (let i = 0; i < cubicCount; i++) {
      let cubicSteps: number;
      if (i < cubicCount - 1) {
        cubicSteps = Mathf.FloorToInt(
          (this.steps * controlPointDistances[i]) / distanceTotal,
        );
        cubicStepsCount += cubicSteps;
      } else {
        cubicSteps = this.steps - cubicStepsCount - 1;
      }

      for (let j = 1; j <= cubicSteps; j++) {
        const t = j / cubicSteps;
        splinePoints[splineIndex++] = new Vector3(
          cubicX[i].eval(t),
          cubicY[i].eval(t),
          cubicZ[i].eval(t),
        );
      }
    }

    return splinePoints;
  }
}
