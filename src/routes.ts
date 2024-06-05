import express, { Request, Response, Router } from "express";

import * as tileController from "./controllers/tile.controller";
import { validateDynamicBbox, validateFetch, validateImage } from "./validators/tile.validator";
import * as imageController from "./controllers/image.controller";

// For documentation on express routers and middleware see: https://expressjs.com/en/guide/routing.html

const rootRouter: Router = express.Router();
//------------
// Middleware
//------------
// Changes req.body to a Buffer. Body expected to be binary with a valid image content-type header
let rawTIFParser = express.raw({type: "image/tiff", limit: "250mb"});

// Home Page
rootRouter.get('/', (req: Request, res: Response) => {
    res.send('Dynamic Tile Service');
});

//------------
// Entity Routes
//------------
rootRouter.get('/fetch', validateFetch, tileController.getTile);
rootRouter.get('/dynamicboundingbox', validateDynamicBbox, tileController.getTileList);
rootRouter.post('/image', validateImage, rawTIFParser, imageController.postImage);


export { rootRouter };
