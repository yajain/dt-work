import { NextFunction, Request, Response } from "express";
import { validationResult, matchedData } from 'express-validator';

import * as tileService from "../services/tile.service";

//////////
// These are the controllers. Their purpose is to handle all HTTP related functions.
// They will call the appropriate services which contain the relevant business logic.
//////////

// 'GET /fetch'
export const getTile = async function (req: Request, res: Response, next: NextFunction) {
    try {
        // Check Validation result
        const result = validationResult(req);
        // Send an error response if there are validation errors
        if(!result.isEmpty())
            return res.status(500).json({ status: 500, errors:result.array(), message: "Invalid request parameters"});
        const data = matchedData(req);  // The sanitized data

        const tracerName = `fetchTile${data.TILECOL}_${data.TILEROW}_${data.ZOOM}`
        console.time(tracerName)
        const tile = await tileService.fetchTile(req, data);
        console.timeEnd(tracerName)

        // Returns a status code 200 response with 'Content-Type' = 'image/png', and the body is the tile image.
        return res.status(200).type('image/png').send(tile);
    } catch (e: any) {
        return res.status(400).json({ status: 400, message: e.message });
    }
}

// 'GET /dynamicboundingbox'
export const getTileList = async function (req: Request, res: Response, next: NextFunction) {
    try {
        // Check Validation result
        const result = validationResult(req);
        // Send an error response if there are validation errors
        if(!result.isEmpty())
            return res.status(500).json({ status: 500, errors:result.array(), message: "Invalid request parameters"});
        const data = matchedData(req);  // The sanitized data

        const traceName = `getUpdatedTileList_${data.BBOX}`
        console.time(traceName)
        let tileList = await tileService.getUpdatedTileList(req,data);
        console.log(`returned ${tileList.length} tiles`)
        console.timeEnd(traceName)

        return res.status(200).json(tileList);
    } catch (e: any) {
        return res.status(400).json({ status: 400, message: e.message });
    }
}
