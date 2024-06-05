import { access, readFile, rename, writeFile } from "fs/promises";

import { dataSource } from "..";
import { Tile } from "../entity/tile.entity";
import { lat_degToNum, lon_degToNum } from "./mathUtils";
import { Between } from "typeorm";
import { SourceChunk } from "../interfaces/SourceChunk.interface";
import { CHUNK_Z } from "../constants";
import { getParentTileHash } from "../services/tile.service";
import { hasParentTile } from "./imageUtils";

export const makeExistingBackup = async (dirPath:string,file:string,filetype:string,ct:number):Promise<Buffer|null> => {
    /* This is a recursive function to check if a file exists, if it does, it increments and checks for a backup until it stops finding backups. Then renames the existing file to a new backup. 
        Return: Buffer - The buffer for the existing image. OR Null - nothing found.
    */
    try{
        // Check if the file exists
        let tempPath:string;
        if(ct == 0)
            tempPath = dirPath + '/' + file + '.' + filetype;
        else   
            tempPath = dirPath + '/' + file + `.backup${ct}.` + filetype;
        // console.log(tempPath);
        await access(new URL(tempPath));

        // A file was found, so check for a backup
        let temp = await makeExistingBackup(dirPath,file,filetype,ct+1);
        return temp;
    } catch(err:any) {  // This means the file doesn't exist.
        // console.log(err);
        // if(err.syscall != 'access') // A real error happened and not that a file was not found
        //     throw Error('Error while backing up tile on loop: ' + ct + '. ' + err.message);
            
        if(ct != 0){
            // Time to rename the existing file to back it up.
            const oldPath = new URL(dirPath + '/' + file + '.' + filetype);
            const newPath = new URL(dirPath + '/' + file + `.backup${ct}.` + filetype);
            const outputBuffer = readFile(oldPath);
            await rename(oldPath,newPath);
            return outputBuffer;
        }
        // If ct = 0, then no existing file, so don't need to do anything else
        return null;
    }
}

export const updateDbTileTimestamp = async (
    x: number,
    y: number,
    z: number,
    layerName: string,
    clientId: number
) => {
    /*
        Attempts to find an existing tile given input XYZ parameters and update it's timestamp.
        If one is not found, an entry is added to the database with the given XYZ, layerName, and current timestamp.

        Params:
            x - x coordinate of tile
            y - y coordinate of tile
            z - zoom level
            layerName - what collection this tile belongs to
            tileAge - optional, when creating a new tile, how long in the past (in miliseconds) should the update_time be set to
        Returns: Tile
            The upserted tile
    */

    const tileRepo = dataSource.getRepository(Tile);

    // Attempt to find an existing tile for a given XYZ (guaranteed to be unique)
    let tileResponse = await tileRepo.findOne({
        where:{
            x: x,
            y: y,
            z: z,
            layer_name: layerName,
            client_id: clientId
        }
    });

    // Check if exists, update the timestamp. If not, then make a new Tile and add to DB.
    if (tileResponse) {
        tileResponse.updated_at = new Date();
        await tileRepo.save(tileResponse);
        return tileResponse;

    } else {
        let tileEntry = new Tile();
        tileEntry.x = x;
        tileEntry.y = y;
        tileEntry.z = z;
        tileEntry.layer_name = layerName;
        tileEntry.client_id = clientId;
        tileEntry.updated_at = new Date();
        await tileRepo.save(tileEntry);
        return tileEntry;
    }
}


export const getTileExtents = (
    boundingBox: [number, number, number, number, number],
): {xmin: number, xmax: number, ymin: number, ymax: number, zoom: number} => {
    // Find tile extents
    const zoom = boundingBox[4];
    const x1 = lon_degToNum(boundingBox[0], zoom);
    const y1 = lat_degToNum(boundingBox[1], zoom);
    const x2 = lon_degToNum(boundingBox[2], zoom);
    const y2 = lat_degToNum(boundingBox[3], zoom);

    const xmin = Math.min(x1,x2);
    const xmax = Math.max(x1,x2);
    const ymin = Math.min(y1,y2);
    const ymax = Math.max(y1,y2);

    return {xmin, xmax, ymin, ymax, zoom}
}


export const listTilesInBoundingBox = (
    tileExtents: {xmin: number, xmax: number, ymin: number, ymax: number, zoom: number},
    layer: string
) => {
    let tileList = []
    for (let x = tileExtents.xmin; x < tileExtents.xmax + 1; x++) {
        for (let y = tileExtents.ymin; y < tileExtents.ymax + 1; y++) {
            const tile = {
                x: x,
                y: y,
                z: tileExtents.zoom,
                layer_name: layer,
            }
            tileList.push(tile)
        }
    }

    return tileList
}


export const getTilesEntriesInBoundingBox = async (
    tileExtents: {xmin: number, xmax: number, ymin: number, ymax: number, zoom: number},
    layerName: string,
    clientId: number
) => {
    const tileRepo = dataSource.getRepository(Tile);

    return tileRepo.find({
        where:{
            x: Between(tileExtents.xmin, tileExtents.xmax),
            y: Between(tileExtents.ymin, tileExtents.ymax),
            z: tileExtents.zoom,
            layer_name: layerName,
            client_id: clientId
        }
    })
}


export const safeWrite = async(pathUrl:URL,image:Buffer) => {
    // Try to brute force around this file system bug where it sometimes doesn't think a file path exists
    try{
        await writeFile(pathUrl,image);
    } catch(e){
        await writeFile(pathUrl,image);
    }
}
