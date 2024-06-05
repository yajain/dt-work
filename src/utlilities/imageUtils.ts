import sharp from 'sharp';
//import * as geotiff from "geotiff";
const geotiff = require("fix-esm").require("geotiff")
import proj4 from "proj4";
import geokeysToProj4 from "geotiff-geokeys-to-proj4";

import { SourceChunk } from '../interfaces/SourceChunk.interface'
import { TiffImage } from '../interfaces/TiffImage.interface';
import { CHUNK_Z } from '../constants';
import { getTileLatLng } from './mathUtils';


export const deepCopySharp = async (imageRaw: sharp.Sharp, pixelExtents: [number, number]) => {
    return sharp(
        await imageRaw.raw().toBuffer(),
        {raw: {width: pixelExtents[0], height: pixelExtents[1], channels: 4}}
    )
}


export const getTiffImage = async (buffer: ArrayBuffer): Promise<TiffImage> => {
    try {
        const tiff = await geotiff.fromArrayBuffer(buffer)
        const image = await tiff.getImage()

        const geoKeys = image.getGeoKeys();
        const projObj = geokeysToProj4.toProj4(geoKeys);
        const projection = proj4(projObj.proj4, "WGS84");

        // min-x, min-y, max-x and max-y
        // note: (max-x, min-y) is the bottom right 
        const [xCrs1, yCrs2, xCrs2, yCrs1] = image.getBoundingBox();

        const point1 = geokeysToProj4.convertCoordinates(xCrs1, yCrs1, projObj.coordinatesConversionParameters);
        const point2 = geokeysToProj4.convertCoordinates(xCrs2, yCrs2, projObj.coordinatesConversionParameters);

        const coords1Dict = projection.forward(point1);
        const coords2Dict = projection.forward(point2);
        const coords1: [number, number] = [coords1Dict.x, coords1Dict.y];
        const coords2: [number, number] = [coords2Dict.x, coords2Dict.y];

        const coordsExtents: [number, number] = [
            coords2[0] - coords1[0],
            coords2[1] - coords1[1]
        ];
        console.log({coords1, coordsExtents})

        const pixelExtents: [number, number] = [
            image.getWidth(),
            image.getHeight()
        ];
        console.log({pixelExtents})

        const scale: [number, number] = [
            pixelExtents[0] / coordsExtents[0],
            pixelExtents[1] / coordsExtents[1]
        ];

        return {
            imageRaw: sharp(
                await sharp(buffer).ensureAlpha().raw().toBuffer(),
                {raw: {width: pixelExtents[0], height: pixelExtents[1], channels: 4}}
            ),
            coords: coords1,
            coordsExtents: coordsExtents,
            pixelExtents: pixelExtents,
            scale: scale
        } as TiffImage
    } catch (e:any){
        throw new Error(`Error during get geotiff:\n${e.message}`);
    }
}


export const extractChunkAt = async (tiffImage: TiffImage, tileCoords: [number, number]): Promise<SourceChunk> => {
    const [tileLatLng, tileLatLngExtents] = getTileLatLng(tileCoords[0], tileCoords[1], CHUNK_Z)

    // compute ideal offsets and extents
    const chunkPixelOffsets: [number, number] = [
        Math.round(tiffImage.scale[0] * (tileLatLng[0] - tiffImage.coords[0])),
        Math.round(tiffImage.scale[1] * (tileLatLng[1] - tiffImage.coords[1]))
    ]
    const chunkPixelExtents: [number, number] = [
        Math.round(tiffImage.scale[0] * tileLatLngExtents[0]),
        Math.round(tiffImage.scale[1] * tileLatLngExtents[1]),
    ]

    // compute extract
    const extractOffsets: [number, number] = [
        Math.max(chunkPixelOffsets[0], 0),
        Math.max(chunkPixelOffsets[1], 0)
    ]
    const extractEnd: [number, number] = [
        Math.min(
            chunkPixelExtents[0] + chunkPixelOffsets[0],
            tiffImage.pixelExtents[0]
        ),
        Math.min(
            chunkPixelExtents[1] + chunkPixelOffsets[1],
            tiffImage.pixelExtents[1]
        )
    ]
    const extractExtents: [number, number] = [
        extractEnd[0] - extractOffsets[0],
        extractEnd[1] - extractOffsets[1]
    ]

    // early stopping: extract extents are zero as a result of image
    // exactly falling on tile lines
    if (extractExtents[0] == 0 || extractExtents[1] == 0) {
        return {
            updatedAt: new Date(),
            imageRaw: sharp({
                create: {
                    width: chunkPixelExtents[0],
                    height: chunkPixelExtents[1],
                    channels: 4,
                    background: "#00000000"
                }
            }),
            tileCoords: tileCoords,
            pixelExtents: chunkPixelExtents
        } as SourceChunk
    }

    // compute extension offsets
    const extendOffsetsLT = [
        Math.max(-chunkPixelOffsets[0], 0),
        Math.max(-chunkPixelOffsets[1], 0),
    ]
    const extendOffsetsRB = [
        chunkPixelExtents[0] - extractExtents[0] - extendOffsetsLT[0],
        chunkPixelExtents[1] - extractExtents[1] - extendOffsetsLT[1],
    ]

    // extract from image
    let chunkImage = tiffImage.imageRaw.clone().extract({
        left: extractOffsets[0],
        top: extractOffsets[1],
        width: extractExtents[0],
        height: extractExtents[1]
    })

    // extend borders with alpha
    if (
        extendOffsetsLT[0] > 0 ||
        extendOffsetsLT[1] > 0 ||
        extendOffsetsRB[0] > 0 ||
        extendOffsetsRB[1] > 0
    ) {
        chunkImage = chunkImage.extend({
            left: extendOffsetsLT[0],
            top: extendOffsetsLT[1],
            right: extendOffsetsRB[0],
            bottom: extendOffsetsRB[1],
            background: "#00000000"
        })
    }

    return {
        updatedAt: new Date(),
        imageRaw: sharp(
            await chunkImage.ensureAlpha().raw().toBuffer(),
            {
                raw: {
                    width: chunkPixelExtents[0],
                    height: chunkPixelExtents[1],
                    channels: 4
                }
            }
        ),
        tileCoords: tileCoords,
        pixelExtents: chunkPixelExtents
    } as SourceChunk
}


export const makeEmptyTile = () => {
    return sharp({
        create: {
            width: 256,
            height: 256,
            channels: 4,
            background: "#00000000"
        }
    })
}


export const clamp = (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max)
}


export const hasParentTile = (sourceChunk: SourceChunk, x: number, y: number, zoomDifference: number) => {
    const sourceChunkTileCoords: [number, number] = [
        sourceChunk.tileCoords[0] >> zoomDifference,
        sourceChunk.tileCoords[1] >> zoomDifference
    ]

    return sourceChunkTileCoords[0] == x && sourceChunkTileCoords[1] == y
}
