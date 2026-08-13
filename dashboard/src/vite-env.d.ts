/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_HTTP_URL?: string;
  readonly VITE_BACKEND_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'leaflet.heat' {
  import * as L from 'leaflet';
  function heatLayer(
    latlngs: Array<[number, number, number?] | L.LatLng>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: { [key: number]: string };
    }
  ): L.Layer;
  export default heatLayer;
}
