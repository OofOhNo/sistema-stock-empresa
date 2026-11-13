export function construirMatrizQr(cadena = '') {
  const N = 25;
  const matriz = Array.from({ length: N }, () => Array(N).fill(false));
  const reservado = Array.from({ length: N }, () => Array(N).fill(false));

  const colocarFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
          reservado[rr][cc] = true;
          const enBorde7 = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
          const enCentro3 = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          matriz[rr][cc] = enBorde7 || enCentro3;
        }
      }
    }
  };

  colocarFinder(0, 0);
  colocarFinder(0, N - 7);
  colocarFinder(N - 7, 0);

  for (let i = 8; i < N - 8; i++) {
    reservado[6][i] = true;
    matriz[6][i] = i % 2 === 0;
    reservado[i][6] = true;
    matriz[i][6] = i % 2 === 0;
  }

  const ar = N - 9;
  const ac = N - 9;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      reservado[ar + r][ac + c] = true;
      matriz[ar + r][ac + c] = r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2);
    }
  }

  const texto = String(cadena || 'SUNAT-CPE');
  const bytes = [];
  for (let i = 0; i < texto.length; i++) {
    bytes.push(texto.charCodeAt(i) & 0xff);
  }
  if (bytes.length === 0) bytes.push(83, 85, 78, 65, 84);

  let bitIdx = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!reservado[r][c]) {
        const byteVal = bytes[Math.floor(bitIdx / 8) % bytes.length];
        const shift = 7 - (bitIdx % 8);
        const mask = (r * 3 + c * 5 + bitIdx) % 2 === 0;
        const bit = ((byteVal >> shift) & 1) === 1;
        matriz[r][c] = bit !== mask;
        bitIdx++;
      }
    }
  }
  return matriz;
}

export function generarSvgQrString(cadena = '', size = 110) {
  const matriz = construirMatrizQr(cadena);
  const N = matriz.length;
  let rects = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matriz[r][c]) {
        rects += `<rect x="${c + 2}" y="${r + 2}" width="1" height="1" fill="#0f172a" />`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N + 4} ${N + 4}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${N + 4}" height="${N + 4}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.5"/>${rects}</svg>`;
}
