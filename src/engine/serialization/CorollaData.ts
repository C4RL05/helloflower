import { Color, Vector3 } from "three";

/**
 * Faithful port of Unity `CorollaData.cs`.
 *
 * Corolla string format:
 *   `<x y z x y z ...>&colors=<r g b r g b>&petals=<n>&open=<f>&spin=<f>&sway=<f>&curve=<f>`
 * with arg separator '&', assign '=', element ' '. The first '&'-segment is the
 * raw, space-separated control-point list.
 */
export class CorollaData {
  static readonly COROLLA_ARGUMENT_SEPARATOR = "&";
  static readonly COROLLA_ARGUMENT_ASSIGN = "=";
  static readonly ELEMENT_SEPARATOR = " ";

  static readonly COLORS_ARG = "colors";
  static readonly PETALS_ARG = "petals";
  static readonly OPEN_ARG = "open";
  static readonly SPIN_ARG = "spin";
  static readonly SWAY_ARG = "sway";
  static readonly CURVE_ARG = "curve";

  controlPoints: Vector3[] = [];
  colors: Color[] = [];
  petalCount = 0;
  open = 0;
  spin = 0;
  sway = 0;
  curve = 0;

  static parse(corollaString: string, colorMult: number): CorollaData {
    const data = new CorollaData();

    const argStrings = corollaString.split(
      CorollaData.COROLLA_ARGUMENT_SEPARATOR,
    );

    const argTable: Record<string, string> = {};
    for (let i = 1; i < argStrings.length; i++) {
      const ops = argStrings[i].split(CorollaData.COROLLA_ARGUMENT_ASSIGN);
      argTable[ops[0]] = ops[1];
    }

    // Control points
    const coordStrings = argStrings[0].split(CorollaData.ELEMENT_SEPARATOR);
    const pointCount = Math.floor(coordStrings.length / 3);
    data.controlPoints = new Array<Vector3>(pointCount);
    let c = 0;
    for (let i = 0; i < pointCount; i++) {
      data.controlPoints[i] = new Vector3(
        parseFloat(coordStrings[c++]),
        parseFloat(coordStrings[c++]),
        parseFloat(coordStrings[c++]),
      );
    }

    // Colors (each component scaled by colorMult; alpha always 1)
    const colorStrings = argTable[CorollaData.COLORS_ARG].split(
      CorollaData.ELEMENT_SEPARATOR,
    );
    const colorCount = Math.floor(colorStrings.length / 3);
    data.colors = new Array<Color>(colorCount);
    c = 0;
    for (let i = 0; i < colorCount; i++) {
      data.colors[i] = new Color(
        parseFloat(colorStrings[c++]) * colorMult,
        parseFloat(colorStrings[c++]) * colorMult,
        parseFloat(colorStrings[c++]) * colorMult,
      );
    }

    data.petalCount = parseInt(argTable[CorollaData.PETALS_ARG], 10);
    data.open = parseFloat(argTable[CorollaData.OPEN_ARG]);
    data.spin = parseFloat(argTable[CorollaData.SPIN_ARG]);
    data.sway = parseFloat(argTable[CorollaData.SWAY_ARG]);
    data.curve = parseFloat(argTable[CorollaData.CURVE_ARG]);

    return data;
  }

  toString(): string {
    const E = CorollaData.ELEMENT_SEPARATOR;

    // Shape
    let shapeString = "";
    for (let i = 0; i < this.controlPoints.length; i++) {
      const p = this.controlPoints[i];
      shapeString += fmt(p.x) + E + fmt(p.y) + E + fmt(p.z);
      if (i < this.controlPoints.length - 1) shapeString += E;
    }

    let corollaString = shapeString;

    // Colors
    let colorsString = "";
    for (let i = 0; i < this.colors.length; i++) {
      const col = this.colors[i];
      colorsString += fmt(col.r) + E + fmt(col.g) + E + fmt(col.b);
      if (i < this.colors.length - 1) colorsString += E;
    }

    corollaString += this.addArg(CorollaData.COLORS_ARG, colorsString);
    corollaString += this.addArg(
      CorollaData.PETALS_ARG,
      String(this.petalCount),
    );
    corollaString += this.addArg(CorollaData.OPEN_ARG, fmt(this.open));
    corollaString += this.addArg(CorollaData.SPIN_ARG, fmt(this.spin));
    corollaString += this.addArg(CorollaData.SWAY_ARG, fmt(this.sway));
    corollaString += this.addArg(CorollaData.CURVE_ARG, fmt(this.curve));

    return corollaString;
  }

  private addArg(argName: string, argValue: string): string {
    return (
      CorollaData.COROLLA_ARGUMENT_SEPARATOR +
      argName +
      CorollaData.COROLLA_ARGUMENT_ASSIGN +
      argValue
    );
  }
}

/**
 * Locale-invariant float formatter for write-back. JS `Number.prototype
 * .toString()` already uses '.' as the decimal separator and no group
 * separators, so it is invariant; this wrapper documents intent and gives us a
 * single place to adjust precision if round-trip parity needs it.
 */
function fmt(value: number): string {
  return String(value);
}
