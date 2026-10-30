# AquaTrace

A local browser for bundled illustrative raw-scene and existing MNDWI sample
images. The sample metadata is for interface demonstration only; it does not
identify or verify real satellite acquisitions. AquaTrace does not retrieve
satellite scenes, read user directories, or calculate or process MNDWI.

## Kubuntu installation

The downloadable package includes the ready-to-run web app and needs only
Python 3 with its standard library. No Python packages, Node.js, database, or
imagery folders are required to launch it.

1. Extract the ZIP with the file manager.
2. Open a terminal in the extracted `AquaTrace` folder.
3. Run:

   ```bash
   python3 run_aquatrace.py
   ```

4. Open the address printed in the terminal (by default
   `http://127.0.0.1:8765`).
5. Press `Ctrl+C` in the terminal to stop the server.

If Python 3 is not installed:

```bash
sudo apt update
sudo apt install python3
```

The server listens on this computer only. If port 8765 is already in use, use
another available port:

```bash
AQUATRACE_PORT=8766 python3 run_aquatrace.py
```

## Troubleshooting

- **The page does not start:** confirm Python 3 is installed and run the
  command from the extracted `AquaTrace` folder. Keep `runtime/` beside
  `run_aquatrace.py`.
- **The port is already in use:** set `AQUATRACE_PORT` to another unused port
  as shown above, then open the new address printed by the server.
- **The satellite map is blank or reports unavailable tiles:** check the
  internet connection and reload the page. The basemap is provided separately
  from the bundled scenes; the local galleries and sample downloads do not
  require map tiles.
- **Hydrology does not draw streams:** the drainage tools need elevation tiles
  (Copernicus GLO-30, with SRTM as a fallback). Confirm the connection, zoom to
  a land area, then run hydrology again. Very large views are resampled or
  limited so the browser stays responsive.
- **Catchment reaches the edge warning:** the computed upstream area extends to
  the edge of the loaded DEM. Pan the map to include more upstream terrain and
  run again to capture the full contributing area.
- **Pour points placed off-channel:** points snap automatically to the nearest
  high-accumulation cell within roughly 280 m. If snapping fails, zoom in and
  place the point closer to a visible stream channel.
- **A place name cannot be found:** place lookup is online; retry with a
  `latitude, longitude` pair instead (for example, `39.08, -120.03`).
- **A gallery is empty:** adjust its date and sensor filters, then apply them.

## Connectivity

The bundled sample images and gallery work locally. The interactive satellite
basemap, place-name lookup, and hydrology elevation tiles use public online
services and need an internet connection. Hydrology reads Copernicus GLO-30
(30 m) where available and fills gaps with SRTM 30 m; tiles for the current
map view are cached in the browser. The drainage network, flow accumulation,
catchment delineation, and all related layers also require Copernicus or SRTM
elevation tiles and therefore need an internet connection. Coordinate
navigation and polygon drawing do not require the place lookup service. Map
tiles are a separate basemap layer and are not sample satellite-scene files.

## Package contents

- `runtime/` — prebuilt app, including the bundled sample imagery.
- `source/` — standalone app source and build configuration.
- `run_aquatrace.py` — small local-only static web server.

No data folders need to be created or populated. Future raw-image and
processed-image directory providers are outside the current package's
functionality.

## Optional source rebuild

To install the development dependencies and run the editable source, install
Node.js 20.19 or newer (or Node.js 22.12+), then use:

```bash
cd source
npm install
npm run dev
```

The prebuilt local app does not need Node.js. The `runtime/` directory is
already included in the ZIP and is what `python3 run_aquatrace.py` serves.
