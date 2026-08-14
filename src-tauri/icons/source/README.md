# Icon Sources

`concepts/selected-a-reference.png` is the user-approved application-icon master. `app-icon.svg` applies the production crop and transparent rounded-square mask without redrawing the approved geometry. The tray SVGs provide simplified state-aware derivatives, and `liquid-glass.svg` is the editable source for the macOS liquid-glass layer.

Regenerate all standard PNG, ICO, ICNS, frontend, and tray outputs from the repository root:

```bash
pnpm icons:generate
```

The command requires the project dependencies and bundled Tauri CLI. It generates into a temporary directory before replacing tracked outputs.

The previous precompiled `Assets.car` was removed because it contained the inherited logo and Xcode 16 cannot compile the newer `.icon` package format. macOS packaging therefore uses the regenerated `icon.icns`; `liquid-glass.svg` remains ready as the editable source for a future Xcode toolchain that supports `.icon` compilation.

`concepts/selected-a-reference.png` is the approved standalone visual reference and must not be manually traced or reinterpreted. Two opposing route arrows form an abstract cat with strong ears and a compact silhouette.
