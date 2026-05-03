type IconData = { width: number; height: number; data: Uint8Array };

export function drawMetroIcon(): IconData {
  const W = 28, H = 28, PR = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: W * PR, height: H * PR, data: new Uint8Array(W * H * PR * PR * 4) };
  ctx.scale(PR, PR);

  const cx = W / 2, cy = H / 2, r = 11;

  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#cc2222";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 1.1)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("М", cx, cy + 0.5);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) };
}

export function drawMetroEntranceIcon(): IconData {
  const W = 18, H = 18, PR = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: W * PR, height: H * PR, data: new Uint8Array(W * H * PR * PR * 4) };
  ctx.scale(PR, PR);

  const cx = W / 2, cy = H / 2, r = 7;

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#7a1010";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 1.05)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("М", cx, cy + 0.5);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) };
}

export function drawZebraIcon(): IconData {
  const w = 22, h = 14;
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: w * 2, height: h * 2, data: new Uint8Array(w * h * 4 * 4) };
  ctx.scale(2, 2);

  const stripes = 5, gap = 2, stripeW = 2.4;
  const totalW = stripes * stripeW + (stripes - 1) * gap;
  const startX = (w - totalW) / 2;
  for (let i = 0; i < stripes; i++) {
    const x = startX + i * (stripeW + gap);
    ctx.fillStyle = "rgba(10, 13, 18, 0.85)";
    ctx.fillRect(x - 0.6, 0.6, stripeW + 1.2, h - 1.2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, 1.2, stripeW, h - 2.4);
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) };
}
