import { Sharp } from "sharp";
export interface TiffImage {
    imageRaw: Sharp
    coords: [number, number]
    coordsExtents: [number, number]
    pixelExtents: [number, number],
    scale: [number, number]
}
