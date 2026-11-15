export const SHARE_WIDTH = 1080;

export type ShareLayout = {
  width: number;
  height: number;
  padding: number;
  titleHeight: number;
  panelSize: number;
  captionHeight: number;
  gap: number;
  footerHeight: number;
  titleFont: number;
  captionFont: number;
  footerFont: number;
};

export function shareLayout(panelCount = 4): ShareLayout {
  const width = SHARE_WIDTH;
  const padding = 64;
  const titleHeight = 200;
  const panelSize = width - padding * 2;
  const captionHeight = 170;
  const gap = 48;
  const footerHeight = 120;
  const height = padding + titleHeight + panelCount * (panelSize + captionHeight) + panelCount * gap + footerHeight + padding;
  return { width, height, padding, titleHeight, panelSize, captionHeight, gap, footerHeight, titleFont: 64, captionFont: 46, footerFont: 40 };
}
