import { INCLUDED_FLOWERS } from "./includedFlowers";

/**
 * Read-only preset flowers for the gallery's first page — only flowers we have
 * loadable description data for. These are the 5 built-ins (IncludedFlowers.cs)
 * plus two unique saved flowers shipped in the Unity project's Documents folder
 * (FantasticPeony, Strelitzia). The duplicate Rose/Strelitzia files are omitted.
 *
 * NOTE: the original app also shipped 24 prerendered gallery thumbnails
 * (flower0..23.png) but with NO description strings, so those specific flowers
 * cannot be reconstructed/loaded and are intentionally excluded.
 */
const FANTASTIC_PEONY =
  "helloflower1.3#name_FantasticPeony#corolla_0 0 0 0.2112838 -0.08893952 -0.5780198 0.6990956 0.176073 -0.7669955 0.9743142 0.1681313 -0.5178118 1.068163 0.1608909 0&colors=1.28877 1.363636 0.7272727 0.8716578 1.363636 0.6844921&petals=8&open=0&spin=0&sway=21.06383&curve=0.2042553#corolla_0 0 0 -0.122229 0.2255277 0.2751524 -0.2768656 0.8237954 0.4936743 -0.460727 1.031156 0.3397468 -0.55005 1.044497 0&colors=1.315508 1.363636 0.6470588 0.8181819 1.363636 0.7219252&petals=8&open=18.90787&spin=0&sway=-15.70213&curve=-0.1294643#corolla_0 0 0 -0.2095201 0.3739603 0.1553823 -0.4103212 0.6051093 0.2197723 -0.691923 0.746277 0.2023736 -0.7765697 0.7590302 0&colors=1.235294 1.363636 0.6149732 0.8663102 1.363636 0.7219252&petals=8&open=-20.10638&spin=0&sway=-17.61702&curve=-0.09787234";

const STRELITZIA =
  "helloflower1.3#name_Strelitzia#corolla_0 0 0 0.3095257 0.06201651 0.2574537 0.6677807 0.3945004 0.2276066 1.037135 0.7654873 0.1474721 1.64142 1.273281 0&colors=0.4483316 0 0.4604487 0 0.566706 0.05219654&petals=1&open=4.828326&spin=0&sway=0&curve=0.1791846#corolla_0 0 0 0.2761907 0.1670288 0.1313255 0.720679 0.399458 0.2812967 1.179781 0.7619464 0.1454236 1.459659 1.003504 0&colors=1.097993 0.23838 0 1.363636 0.9693655 0.08854785&petals=3&open=30.90129&spin=-60.64378&sway=0&curve=0.1244635#corolla_0 0 0 -0.09374021 0.503763 0.06390327 0.1953555 0.7334473 0.1347858 -0.3774264 0.9141283 0.06657988 -0.9269742 1.359592 0&colors=0.6286897 0 0.6729634 0.5075187 0 0.6375443&petals=1&open=19.12017&spin=59.87125&sway=0&curve=-0.07296138";

export const PRESET_FLOWERS: readonly string[] = [
  ...INCLUDED_FLOWERS,
  FANTASTIC_PEONY,
  STRELITZIA,
];
