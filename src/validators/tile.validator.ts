import { query,body, header } from "express-validator";

// See: https://express-validator.github.io/docs/guides/validation-chain for express-validator docs
// See: https://github.com/validatorjs/validator.js for validator.js basic validator documentation

////////////////
//// Validators
////////////////

const validateBbox = () => query('BBOX','Invalid bbox format').notEmpty().isString().custom((value:String) => {
    function isNumeric(str:string) {
        // Regex testing to see if a string is a numeric value. Accepts negatives and floats.
        const pattern = /^-?\d+(\.\d+)?$/; 
        return pattern.test(str);
    }

    // Check if the value of 'bbox' is 5 comma separated numbers.
    let myArray = value.split(',');
    if (myArray.length == 5) {
        for(let x of myArray) {
            if(!isNumeric(x))
                return false;
        }
        return true;
    }
    else
        return false;
})
.customSanitizer((value:string) =>{
    // Turns the string into an array of 5 floats
    return value.split(',').map(v => parseFloat(v));
});

// These make a default value if empty. If not empty, they check that the value is an allowed value.
const validateCrs = () => query('CRS').default('EPSG:900913').custom((value:string) =>{
    if(value == 'EPSG:900913')
        return true;
    else
        return false;
});
const validateMimetype = () => query('MIMETYPE').default('image/png').custom((value:string) =>{
    if(value == 'image/png')
        return true;
    else
        return false;
});
const validateService = () => query('SERVICE').default('WMTS').custom((value:string) =>{
    if(value == 'WMTS')
        return true;
    else
        return false;
});
const validateRequesttype = () => query('REQUESTTYPE').default('GetTile').custom((value:string) =>{
    if(value == 'GetTile')
        return true;
    else
        return false;
});
const validateVersion= () => query('VERSION').default('1.0.0').custom((value:string) =>{
    if(value == '1.0.0')
        return true;
    else
        return false;
});
const validateStyle= () => query('STYLE').default('raster').custom((value:string) =>{
    if(value == 'raster')
        return true;
    else
        return false;
});
const validateTilematrixset = () => query('TILEMATRIXSET').default('EPSG:900913').custom((value:string) =>{
    if(value == 'EPSG:900913')
        return true;
    else
        return false;
});
const validateTilematrix = () => query('TILEMATRIX').default('EPSG:900913').custom((value:string) =>{
    if(value == 'EPSG:900913')
        return true;
    else
        return false;
});

// Basic Parameter Validation
const validateTilerow = () => query('TILEROW').notEmpty().isInt();
const validateTilecol = () => query('TILECOL').notEmpty().isInt();
const validateZoom = () => query('ZOOM').notEmpty().isInt();
const validateX = () => query('x').notEmpty().isFloat();
const validateY = () => query('y').notEmpty().isFloat();
const validateZ = () => query('z').notEmpty().isInt();
const validateLayerName = () => query('LAYER').notEmpty().isString();

// Extra PUT /tile validations
const validateTileBody = () => body(undefined,'Request body must be a valid PNG').notEmpty();
const validateTileHeaders = () => header('Content-Type','Content-Type must be image/png').custom((value:string) =>{
    if(value == 'image/png')
        return true;
    else
        return false;
});

// PUT /image tile validations
const validateImageBody = () => body(undefined,'Request body must be a valid TIF').notEmpty();
const validateImageHeaders = () => header('Content-Type','Content-Type must be image/tiff').custom((value:string) => {
    if(value == 'image/tiff')
        return true;
    else
        return false;
})

////////////////////
// Arrays of validation chains for endpoints
////////////////////
// Currently ignoring any extraneous parameters. We could make the validators error if any extra parameter are sent.

// 'GET /dynamicboundingbox'
export const validateDynamicBbox = [
    validateLayerName(),
    validateBbox(),
    // validateCrs(),
    // validateMimetype()
];

// 'PUT /tile'
export const validateTile =  [
    validateLayerName(),
    validateX(),
    validateY(),
    validateZ(),
    // validateMimetype(),
    // validateCrs(),
    validateTileBody(),
    validateTileHeaders()
];

// 'GET /fetch'
export const validateFetch = [
    validateService(),
    validateRequesttype(),
    validateVersion(),
    validateLayerName(),
    validateStyle(),
    validateMimetype(),
    validateTilematrixset(),
    validateTilematrix(),
    validateTilerow(),
    validateTilecol(),
    validateZoom()
];

// 'PUT /image'
export const validateImage = [
    validateImageBody(),
    validateImageHeaders()
]