# OFDM Explorer (WCM555 Build-a-Tool)

An interactive, browser-based tool that builds up OFDM one idea at a time. It has no installation and no libraries, just HTML, CSS and JavaScript.

## Run it in VS Code
1. Unzip, then **File → Open Folder…** and pick `ofdm-explorer`.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` and choose **Open with Live Server**. The page reloads every time you save.

(Double-clicking `index.html` also works, since nothing needs a server.)

## File map
| File | What it does |
|---|---|
| `index.html` | Page layout: tabs, sliders, plot areas |
| `style.css` | Colours and layout (rainbow palette based on the VSA OFDM spectrum figure) |
| `js/ofdm-math.js` | **All the math.** No drawing, so every formula can be checked alone |
| `js/plot.js` | Tiny canvas plotting helper: axes, ticks, labels, data→pixel mapping |
| `js/tab1.js` | Tab 1: subcarriers & orthogonality |
| `js/tab2.js` | Tab 2: multipath & cyclic prefix (sample-by-sample link simulation) |
| `js/tab3.js` | Tab 3: Wi-Fi 802.11a subcarrier map, rate modes, burst timing |
| `js/main.js` | Tab switching |

## Where each equation lives (useful for the Q&A)
| Concept | Equation | Function in `ofdm-math.js` |
|---|---|---|
| Subcarrier spacing | Δf = 1/τS = RS | used in `tab1.js → render()` |
| Subcarrier frequency | fk = (k + ε)·Δf | `subcarrierFreq` |
| One subcarrier | \|Xk\|·cos(2πfk·t + ∠Xk) | `subcarrierWave` |
| OFDM symbol (IFFT) | x(t) = Σ Xk·e^(j2πfk·t) | `compositeWave` |
| Sinc spectrum | \|Xk\|·\|sinc((f − fk)τS)\| | `lobe`, `compositeSpectrum` |
| Orthogonality | (2/T)∫cos(2πfi t)cos(2πfj t)dt | `correlate` |
| PAPR | Vpk² / Vrms² | `papr`, `paprMax` |
| ICI from offset | sinc²(ε) / Σ sinc²(k − m + ε) | `iciSIR` |
| Throughput | Rb = N·log2M / τS | `bitRate` |
| Bandwidth | (N+1)Δf vs FDM 2NΔf | `bwOFDM`, `bwFDM` |
| FFT / IFFT | X[k] = Σ x[n]e^(−j2πkn/N) | `fft` |
| Tx → channel → Rx | IFFT, add CP, y = x + a·e^(jφ)·x(t−τ), drop CP, FFT, Y/H | `simulateLink` |
| Channel response | H(f) = 1 + a·e^(jφ)·e^(−j2πfτ) | `twoPathH` |
| ISI condition | ISI-free if T_CP ≥ τ | `tab2.js → readouts()` |
| EVM | √(Σ\|X̂−X\|² / Σ\|X\|²) | `simulateLink` |
| 802.11a timing | Δf = fs/64, T_GI = T_FFT/4, T_SYM = T_FFT + T_GI | `wifiTiming` |
| 802.11a rate | N_DBPS = 48·N_BPSC·R, Rb = N_DBPS/T_SYM | `wifiRate` |
| Burst length | N_SYM = ⌈(16 + 8·bytes + 6)/N_DBPS⌉ | `wifiFrame` |
- Tab 3: effective throughput counts only PHY overhead (preamble, SIGNAL, padding). Real Wi-Fi also loses time to MAC headers, ACKs and backoff, which is why the VSA notes say realistic throughput is in the mid-20s Mbit/s.
- The frequency offset ε is applied equally to all subcarriers.
- PAPR uses the real waveform (Vpk²/Vrms², as in the handout), not the complex envelope.
