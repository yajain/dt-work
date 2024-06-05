import { NextFunction, Request, Response } from "express";

//import * as imageService from "../services/image.service";
import * as tileService from "../services/tile.service";

export const postImage = async function (req: Request, res: Response, next: NextFunction) {
    try {
        console.time("ingestImage")
        await tileService.ingestImage(req.body.buffer)
        console.timeEnd("ingestImage")

        //return res.status(200).json(response);
        return res.status(200).send("Image ingested");
    } catch (e:any) {
        return res.status(500).send(`Error during image upload:\n${e.message}`)
    }
}
