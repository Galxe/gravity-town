/**
 * Recolor green-hued pixels in a texture to a target color.
 * Creates a new texture with the roof tinted to the owner's color.
 */
export function recolorTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  newKey: string,
  targetColor: number,
): void {
  if (scene.textures.exists(newKey)) return;

  const source = scene.textures.get(sourceKey);
  if (!source || source.key === '__MISSING') return;

  const frame = source.getSourceImage() as HTMLImageElement;
  if (!frame || !frame.width) return;

  const w = frame.width;
  const h = frame.height;

  // Draw source onto offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(frame, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Target color RGB
  const tR = (targetColor >> 16) & 0xff;
  const tG = (targetColor >> 8) & 0xff;
  const tB = targetColor & 0xff;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 10) continue; // skip transparent

    // Detect green-ish pixels: green channel dominant
    // Green roof colors are roughly: g > r && g > b && g > 80
    const isGreen = g > r * 1.1 && g > b * 1.2 && g > 60;

    if (isGreen) {
      // Preserve luminance: use green channel as brightness reference
      const brightness = g / 180; // normalize to ~1.0 for typical roof green
      data[i]     = Math.min(255, Math.round(tR * brightness));
      data[i + 1] = Math.min(255, Math.round(tG * brightness));
      data[i + 2] = Math.min(255, Math.round(tB * brightness));
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Create new Phaser texture from the recolored canvas
  scene.textures.addCanvas(newKey, canvas);
}
