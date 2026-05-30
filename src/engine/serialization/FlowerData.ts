import { CorollaData } from "./CorollaData";
import type { FlowerConfig } from "../model/FlowerConfig";

/**
 * Faithful port of Unity `FlowerData.cs`.
 *
 * Flower string format:
 *   `helloflower1.3#name_<NAME>#corolla_<COROLLA>#corolla_<COROLLA>...`
 * with arg separator '#', assign '_'.
 *
 * The legacy `helloflower1.0` header is LOAD-BEARING: all 24 built-in flowers
 * use it and require the color-doubling path `colorMult = 2 / textureMultiplier`
 * (verified in IncludedFlowers.cs). We always write back as `helloflower1.3`
 * (colorMult = 1), matching the original `ToString`.
 */
export class FlowerData {
  static readonly FLOWER_ARGUMENT_SEPARATOR = "#";
  static readonly FLOWER_ARGUMENT_ASSIGN = "_";

  static readonly FLOWER_HEADER = "helloflower1.3";
  static readonly FLOWER_HEADER_COLOR_X2 = "helloflower1.0";
  static readonly NAME_ARG = "name";
  static readonly COROLLA_ARG = "corolla";

  version = "";
  flowerName = "";
  corollas: CorollaData[] = [];

  static parse(description: string, config: FlowerConfig): FlowerData {
    const data = new FlowerData();
    data.build(description, config);
    return data;
  }

  build(description: string, config: FlowerConfig): void {
    const argStrings = description.split(
      FlowerData.FLOWER_ARGUMENT_SEPARATOR,
    );
    const header = argStrings[0];

    const argTable: Record<string, string> = {};
    const corollaStrings: string[] = [];

    for (let i = 1; i < argStrings.length; i++) {
      const ops = argStrings[i].split(FlowerData.FLOWER_ARGUMENT_ASSIGN);
      const opField = ops[0];
      const opValue = ops[1];

      if (opField === FlowerData.COROLLA_ARG) {
        corollaStrings.push(opValue);
      } else {
        argTable[opField] = opValue;
      }
    }

    this.version = argStrings[0];
    this.flowerName = argTable[FlowerData.NAME_ARG] ?? "";

    const colorMult =
      header === FlowerData.FLOWER_HEADER_COLOR_X2
        ? 2 / config.textureMultiplier
        : 1;

    this.corollas = corollaStrings.map((s) => CorollaData.parse(s, colorMult));
  }

  toString(): string {
    let description = FlowerData.FLOWER_HEADER;
    description += this.addArg(FlowerData.NAME_ARG, this.flowerName);
    for (const corolla of this.corollas) {
      description += this.addArg(FlowerData.COROLLA_ARG, corolla.toString());
    }
    return description;
  }

  private addArg(argName: string, argValue: string): string {
    return (
      FlowerData.FLOWER_ARGUMENT_SEPARATOR +
      argName +
      FlowerData.FLOWER_ARGUMENT_ASSIGN +
      argValue
    );
  }
}
