import { Sharp } from "sharp";

export interface SourceChunk {
    updatedAt: Date
    imageRaw: Sharp
    tileCoords: [number, number]
    pixelExtents: [number, number]
}
