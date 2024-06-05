import { readFile, mkdir, access } from 'node:fs/promises';

import sharp from 'sharp';
import { Request } from 'express';
import Queue from 'promise-queue';

import { dataSource } from '../index';
import { Tile } from '../entity/tile.entity';

import { SourceChunk } from '../interfaces/SourceChunk.interface';

import { getXYExtent } from '../utlilities/mathUtils';
import { deepCopySharp, makeEmptyTile, hasParentTile, clamp, getTiffImage, extractChunkAt } from '../utlilities/imageUtils';

import { CHUNK_Z, CLIENT_ID, TILE_SIZE } from '../constants'
import { TiffImage } from '../interfaces/TiffImage.interface';
import { getTileExtents, listTilesInBoundingBox, updateDbTileTimestamp } from '../utlilities/fileUtils';
import { asyncFilter } from '../utlilities/mathUtils'

// This extends the SessionData interface, so we can add values to the session without TSLint throwing a fit.
// See: https://stackoverflow.com/questions/38900537/typescript-extend-express-session-interface-with-own-class
declare module 'express-session' {
    interface SessionData {
        timestamp: number;
    }
}
// Note: Session.save() is automatically called at th end of the HTTP response if the session data has been altered.
// See: https://expressjs.com/en/resources/middleware/session.html

// Note: there's actual no requirement that chunks all need to be the same zoom,
//       only that they are non-overlapping. You could theoretically create some
//       sort of dynamic chunking which consolodates smaller chunks or breaks up
//       larger chunks, although I'm not sure what priors you'd have there

export let sourceChunks: {[tileHash: string]: SourceChunk} = {}

let queueArray:{[tileHash:string]:Queue} = {};

let emptyTileBuffer: ArrayBuffer | null = null


export const getEmptyTile = async () => {
    if (emptyTileBuffer == null) {
        emptyTileBuffer = await makeEmptyTile().png().toBuffer()
    }
    return emptyTileBuffer
}


export const hashChunk = (sourceChunk: SourceChunk): string => {
    return `${sourceChunk.tileCoords[0]}_${sourceChunk.tileCoords[1]}`
}

export const hashCoords = (x:number,y:number): string => {
    return `${x}_${y}`;
}


export const mergeChunks = async (existingChunk: SourceChunk, incomingChunk: SourceChunk): Promise<SourceChunk> => {
    if (
        existingChunk.tileCoords[0] != incomingChunk.tileCoords[0] ||
        existingChunk.tileCoords[1] != incomingChunk.tileCoords[1]) {
        console.log("ERROR, tile coordinate mismatch")
        return incomingChunk
    }

    // adopt the higher resolution
    const targetResolution = [
        Math.max(existingChunk.pixelExtents[0], incomingChunk.pixelExtents[0]),
        Math.max(existingChunk.pixelExtents[1], incomingChunk.pixelExtents[1]),
    ]

    // resize to match
    const existingResized = existingChunk.imageRaw.clone()
        .resize({
            width: targetResolution[0],
            height: targetResolution[1]
        })
    const incomingResized = incomingChunk.imageRaw
        .resize({
            width: targetResolution[0],
            height: targetResolution[1]
        })

    // merge image
    const mergedImage = existingResized
        .composite([
            {
                input: await incomingResized.toBuffer(),
                raw: {width: targetResolution[0], height: targetResolution[1], channels: 4},
                left: 0,
                top: 0,
                blend: "over"
            }
        ])

    return {
        updatedAt: new Date(),
        imageRaw: sharp(
            await mergedImage.raw().toBuffer(),
            {raw: {width: targetResolution[0], height: targetResolution[1], channels: 4}}
        ),
        tileCoords: existingChunk.tileCoords,
        pixelExtents: targetResolution
    } as SourceChunk
}


export const ingestImage = async (buffer: ArrayBuffer) => {
    // extract tiff image data
    const tiffImage: TiffImage = await getTiffImage(buffer)

    // get tile extents
    const { xmin, xmax, ymin, ymax } = getXYExtent(tiffImage.coords, tiffImage.coordsExtents, CHUNK_Z)

    // for each tile in the tile extents,
    // create a new chunk and merge into list
    for (let tileX = xmin; tileX <= xmax; tileX++) {
        for (let tileY = ymin; tileY <= ymax; tileY++) {
            const tileCoords: [number, number] = [tileX, tileY]
            const chunkHash = hashCoords(...tileCoords);

            if(!queueArray[chunkHash])
                queueArray[chunkHash] = new Queue(1,100);

            queueArray[chunkHash].add(() => processImageChunk(tiffImage,tileCoords, chunkHash));
        }
    }
}

const processImageChunk = async (tiffImage:TiffImage, tileCoords:[number,number], chunkHash:string) => {
    const incomingChunk = await extractChunkAt(tiffImage, tileCoords)

    const existingChunk = sourceChunks[chunkHash]

    sourceChunks[chunkHash] = existingChunk ? await mergeChunks(existingChunk, incomingChunk) : incomingChunk
}


export const getParentTileHash = (tileX: number, tileY: number, zoom: number): string => {
    const zoomDifference = zoom - CHUNK_Z
    const parentChunkX = tileX >> zoomDifference
    const parentChunkY = tileY >> zoomDifference

    const parentChunkHash = `${parentChunkX}_${parentChunkY}`

    return parentChunkHash
}


export const fetchTile = async (req: Request, data: any) => {
    updateDbTileTimestamp(data.TILECOL, data.TILEROW, data.ZOOM, data.LAYER, CLIENT_ID)

    if (data.ZOOM >= CHUNK_Z) {
        const parentChunkHash = getParentTileHash(data.TILECOL, data.TILEROW, data.ZOOM)

        if (parentChunkHash in sourceChunks) {
            return extractTileFromLargerChunk(sourceChunks[parentChunkHash], data.TILECOL, data.TILEROW, data.ZOOM)
        } else {
            return getEmptyTile()
        }

    } else {
        const zoomDifference = CHUNK_Z - data.ZOOM

        const chunksInTile = Object.values(sourceChunks)
            .filter(sourceChunk => hasParentTile(sourceChunk, data.TILECOL, data.TILEROW, zoomDifference))

        if (chunksInTile.length > 0) {
            return extractTileFromSmallerChunks(chunksInTile, data.TILECOL, data.TILEROW, data.ZOOM)
        } else {
            return getEmptyTile()
        }
    }
}


export const extractTileFromSmallerChunks = async (sourceChunks: SourceChunk[], x: number, y: number, z: number): Promise<Buffer> => {
    const zoomDifference = CHUNK_Z - z

    let compositePromises: Promise<sharp.OverlayOptions>[] = []
    for (const sourceChunk of sourceChunks) {
        // pretend tile is at source chunk zoom to aid extract calculations
        const tileCoordsAtSourceZ = [
            x << zoomDifference,
            y << zoomDifference
        ]
        const tileExtentsAtSourceZ = [
            1 << zoomDifference,
            1 << zoomDifference,
        ]

        // resize
        const resizeExtents: [number, number] = [
            TILE_SIZE >> zoomDifference,
            TILE_SIZE >> zoomDifference
        ]

        // skip if chunk is too small to be seen
        if (resizeExtents[0] <= 0 || resizeExtents[1] <= 0) {
            continue
        }

        // get chunk offsets in tile
        const chunkOffsets = [
            ((sourceChunk.tileCoords[0] - tileCoordsAtSourceZ[0]) / tileExtentsAtSourceZ[0]) * TILE_SIZE,
            ((sourceChunk.tileCoords[1] - tileCoordsAtSourceZ[1]) / tileExtentsAtSourceZ[1]) * TILE_SIZE,
        ]

        // resize
        const imageResized = sourceChunk.imageRaw.clone().resize({
            width: resizeExtents[0],
            height: resizeExtents[1],
            fit: "fill"
        })

        // place in tile, asynchronously process resizing
        compositePromises.push(new Promise(async (resolve, _reject) => {
            resolve({
                input: await imageResized.raw().toBuffer(),
                raw: {width: resizeExtents[0], height: resizeExtents[1], channels: 4},
                left: chunkOffsets[0],
                top: chunkOffsets[1],
                blend: "over"
            })
        }))
    }

    const compositeList: sharp.OverlayOptions[] = await Promise.all(compositePromises)
    return await makeEmptyTile().composite(compositeList).png().toBuffer()
}


export const extractTileFromLargerChunk = async (sourceChunk: SourceChunk, x: number, y: number, z: number): Promise<Buffer> => {
    /*
        TODO: IMPORTANT: tile coordinate assumptions will fail near the prime meridian

        TODO: unit tests
        TODO: guard against zero division
    */
    // calculate zoom difference
    const zoomDifference = z - CHUNK_Z

    // pretend sourceChunk is at z to aid extract calculations
    const sourceTileCoordsAtZ = [
        sourceChunk.tileCoords[0] << zoomDifference,
        sourceChunk.tileCoords[1] << zoomDifference
    ]
    const sourceTileExtentsAtZ = [
        1 << zoomDifference,
        1 << zoomDifference,
    ]

    // calculate extraction with float precision
    const extractPixelOffsets = [
        (x - sourceTileCoordsAtZ[0]) / sourceTileExtentsAtZ[0] * sourceChunk.pixelExtents[0],
        (y - sourceTileCoordsAtZ[1]) / sourceTileExtentsAtZ[1] * sourceChunk.pixelExtents[1]
    ]
    const extractPixelExtents = [
        sourceChunk.pixelExtents[0] / (1 << zoomDifference),
        sourceChunk.pixelExtents[1] / (1 << zoomDifference),
    ]

    // get outer extract offsets and pixel extents
    const outerExtractPixelOffsets: [number, number] = [
        Math.floor(extractPixelOffsets[0]),
        Math.floor(extractPixelOffsets[1]),
    ]
    const outerExtractPixelExtents: [number, number] = [
        Math.ceil(extractPixelOffsets[0] + extractPixelExtents[0]) - outerExtractPixelOffsets[0],
        Math.ceil(extractPixelOffsets[1] + extractPixelExtents[1]) - outerExtractPixelOffsets[1]
    ]

    // get resize extents
    const resizeExtents = [
        Math.ceil(TILE_SIZE * outerExtractPixelExtents[0] / extractPixelExtents[0]),
        Math.ceil(TILE_SIZE * outerExtractPixelExtents[1] / extractPixelExtents[1]),
    ]

    // get inner extract offsets
    const outerExtractOffsetError = [
        extractPixelOffsets[0] - outerExtractPixelOffsets[0],
        extractPixelOffsets[1] - outerExtractPixelOffsets[1],
    ]
    const innerExtractPixelOffsets = [  // finite precision means clamping is necessary
        clamp(
            Math.round(outerExtractOffsetError[0] / extractPixelExtents[0] * TILE_SIZE),
            0, resizeExtents[0] - TILE_SIZE
        ),
        clamp(
            Math.round(outerExtractOffsetError[1] / extractPixelExtents[0] * TILE_SIZE),
            0, resizeExtents[1] - TILE_SIZE
        ),
    ]

    // extract tile
    return sourceChunk.imageRaw.clone()
        .extract({
            left: outerExtractPixelOffsets[0],
            top: outerExtractPixelOffsets[1],
            width: outerExtractPixelExtents[0],
            height: outerExtractPixelExtents[1],
        })
        .resize({
            width: resizeExtents[0],
            height: resizeExtents[1],
            fit: "fill"
        })
        .extract({
            left: innerExtractPixelOffsets[0],
            top: innerExtractPixelOffsets[1],
            width: TILE_SIZE,
            height: TILE_SIZE,
        })
        .png()
        .toBuffer()
}


export const getUpdatedTileList = async (req:Request,data:any) => {
    // Find tile extents
    const tileExtents = getTileExtents(data.BBOX)

    // List all tiles within extents
    const tilesInBBox = listTilesInBoundingBox(tileExtents, data.LAYER)

    // filter tiles based on whether they have source chunks which have been updated
    const tileRepo = dataSource.getRepository(Tile);
    const tilesToUpdate = await asyncFilter(tilesInBBox, async (tile:any) => {
        if (tile.z >= CHUNK_Z) {
            // get source chunk
            const parentTileHash = getParentTileHash(tile.x, tile.y, tile.z)
            const sourceChunk = sourceChunks[parentTileHash]

            // if no source chunk exists, do not update
            if (!!!sourceChunk) {
                return false
            }

            // get previous tile fetch record
            const tileEntry = await tileRepo.findOne({
                where:{
                    x: tile.x,
                    y: tile.y,
                    z: tile.z,
                    layer_name: data.LAYER,
                    client_id: CLIENT_ID
                }
            })

            // if tile has never been sent to client, update
            if (!!!tileEntry) {
                return true
            }

            // send tile if source chunk has updated since tile was last fetched
            return sourceChunk.updatedAt > tileEntry.updated_at
        } else {
            // get source chunks
            const zoomDifference = CHUNK_Z - tile.z
            const chunksInTile = Object.values(sourceChunks)
                .filter(sourceChunk => hasParentTile(sourceChunk, tile.x, tile.y, zoomDifference))

            // if no source chunk exists, do not update
            if (chunksInTile.length <= 0) {
                return false
            }

            // get previous tile fetch record
            const tileEntry = await tileRepo.findOne({
                where:{
                    x: tile.x,
                    y: tile.y,
                    z: tile.z,
                    layer_name: data.LAYER,
                    client_id: CLIENT_ID
                }
            })

            // if tile has never been sent to client, update
            if (!!!tileEntry) {
                return true
            }

            // send tile if any source chunk has updated since tile was last fetched
            const updatedChunk = chunksInTile
                .find((chunk: SourceChunk) => chunk.updatedAt > tileEntry.updated_at)
            return updatedChunk != null
        }
    })

    // 5. return list
    return tilesToUpdate
}
