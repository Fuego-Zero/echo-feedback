import { describe, expect, it } from "vitest";

import { accentColors } from "../../packages/sdk/src/colors.js";

function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map(channel => Number.parseInt(channel, 16) / 255);
  return rgb.reduce(
    (sum, channel, index) =>
      sum +
      (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index],
    0
  );
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("书卷主题可读性", () => {
  it("自定义主色跨越深浅色时保持按钮文字对比度", () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const input = `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("")}`;
          const colors = accentColors(input);
          expect(contrast(colors.accent, colors.foreground)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(colors.text, "#F4EBDD")).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("拒绝无效颜色并保留安全的朱砂缺省值", () => {
    for (const input of [undefined, "red", "#fff", "#ffffff;}body{display:none", "#zzzzzz"]) {
      expect(accentColors(input).accent).toBe("#A64232");
    }
  });

  it("正文、状态文字和控件边界具有足够对比度", () => {
    const textPairs = [
      ["#302B26", "#FBF7EF"],
      ["#766552", "#F4EBDD"],
      ["#75521C", "#EEE0C4"],
      ["#405E6B", "#E0E6E7"],
      ["#405C39", "#E1E7D8"],
      ["#EEE3CF", "#27231F"],
      ["#C2B39E", "#342E28"],
      ["#687085", "#F6F7FB"],
      ["#a7aec2", "#232939"],
      ["#53685b", "#eef2e8"],
      ["#b6c6b7", "#2b3b32"],
      ["#675e49", "#eee4d0"],
      ["#c3b698", "#303a33"],
      ["#715927", "#eee4d0"],
    ];
    for (const [text, background] of textPairs) {
      expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    }

    expect(contrast("#988671", "#FBF7EF")).toBeGreaterThanOrEqual(3);
    expect(contrast("#9D8B74", "#342E28")).toBeGreaterThanOrEqual(3);
    expect(contrast("#858da3", "#F6F7FB")).toBeGreaterThanOrEqual(3);
    expect(contrast("#7c859e", "#232939")).toBeGreaterThanOrEqual(3);
    expect(contrast("#7b8a76", "#eef2e8")).toBeGreaterThanOrEqual(3);
    expect(contrast("#859983", "#2b3b32")).toBeGreaterThanOrEqual(3);
    expect(contrast("#8c795c", "#eee4d0")).toBeGreaterThanOrEqual(3);
    expect(contrast("#9a8965", "#303a33")).toBeGreaterThanOrEqual(3);
  });

  it("风格主色只在未提供有效覆盖色时使用", () => {
    expect(accentColors(undefined, "#6256D9").accent).toBe("#6256D9");
    expect(accentColors("invalid", "#6256D9").accent).toBe("#6256D9");
    expect(accentColors("#fff1cc", "#6256D9").accent).toBe("#fff1cc");
    const gold = accentColors(undefined, "#B59A62", "#715927");
    expect(gold.accent).toBe("#B59A62");
    expect(gold.text).toBe("#715927");
    expect(contrast(gold.accent, gold.foreground)).toBeGreaterThanOrEqual(4.5);
  });
});

it("科幻皮肤正文、边界和按钮对比度", () => {
  for (const [muted, line, background] of [
    ["#505e61", "#78877e", "#e7ebe3"],
    ["#a8bbc0", "#74888d", "#1c2329"],
    ["#536780", "#7c8da5", "#ffffff"],
    ["#b4c3da", "#8294b2", "#202e45"],
    ["#705b68", "#7c8da5", "#ffffff"],
    ["#cbb8c5", "#a18b9d", "#332a38"],
  ]) {
    expect(contrast(muted, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(line, background)).toBeGreaterThanOrEqual(3);
  }

  for (const accent of ["#FCEE09", "#245BD6", "#A62F50"]) {
    const colors = accentColors(undefined, accent);
    expect(contrast(colors.accent, colors.foreground)).toBeGreaterThanOrEqual(4.5);
  }
});
