function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function accentColors(input?: string, fallback = "#A64232", readableFallback = "#8B3024") {
  // 只接受六位十六进制，避免配置值注入额外 CSS。
  const accent = /^#[\da-f]{6}$/i.test(input ?? "") ? input! : fallback;
  const value = luminance(accent);
  const whiteContrast = 1.05 / (value + 0.05);
  const inkContrast = (value + 0.05) / (luminance("#302B26") + 0.05);
  let foreground = "#000000";
  if (whiteContrast >= 4.5) {
    foreground = "#ffffff";
  } else if (inkContrast >= 4.5) {
    foreground = "#302B26";
  }

  return {
    accent,
    foreground,
    text: (luminance("#F4EBDD") + 0.05) / (value + 0.05) >= 4.5 ? accent : readableFallback,
  };
}
