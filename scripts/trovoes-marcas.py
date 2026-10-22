"""Acha os trovões fortes de public/sons/trovoes.mp3 para sincronizar os relâmpagos.

Uso: python3 scripts/trovoes-marcas.py   (precisa de ffmpeg e numpy)
Imprime a lista colada em src/audio/thunderMarks.ts: [início em s, pico em dBFS].
Um trovão = subida de 10 dB ou mais sobre o mínimo do 1,5 s anterior; ficam os mais fortes,
com pelo menos 7 s entre um e outro (os demais são o ronco contínuo da mesma tempestade).
"""
import subprocess
import numpy as np

sr = 8000
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'public/sons/trovoes.mp3', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
d = np.frombuffer(raw, dtype=np.float32)
hop, win = 200, 400
db = 20 * np.log10(np.array([np.sqrt(np.mean(d[i:i + win] ** 2) + 1e-12) for i in range(0, len(d) - win, hop)]))
t = np.arange(len(db)) * hop / sr
cands, last = [], -9.0
for i in range(60, len(db)):
    if db[i] - db[i - 60:i - 4].min() > 10 and db[i] > -38 and db[i] > db[i - 1] and t[i] - last > 2.5:
        cands.append((float(t[i]), float(db[i:i + 60].max())))
        last = t[i]
chosen = []
for at, pk in sorted(cands, key=lambda c: -c[1]):
    if pk >= -20 and all(abs(at - c[0]) >= 7 for c in chosen):
        chosen.append((at, pk))
print(sorted((round(a, 2), round(p, 1)) for a, p in chosen), len(d) / sr)
