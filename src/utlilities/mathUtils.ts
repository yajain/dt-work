export const lat_degToNum = (lat_deg:number,zoom:number):number => {
    // Turns latitude into tile y coordinate.

    const lat_rad = lat_deg * (Math.PI / 180);
    const n = 2.0 ** zoom;
    const ytile = (1.0 - Math.asinh(Math.tan(lat_rad)) / Math.PI) / 2.0 * n;
    return Math.floor(ytile);
}

export const lon_degToNum = (lon_deg:number,zoom:number):number => {
    // Turns longitude into tile x coordinate.

    const n = 2.0 ** zoom;
    const xtile = (lon_deg + 180.0) / 360.0 * n;
    return Math.floor(xtile);
}

export const getTileLatLng = (x: number, y: number, z: number): [[number, number], [number, number]] => {
    const numTiles = Math.pow(2, z);

    // save some computation
    const lngPerX = 360.0 / numTiles
    const lngDeg1 = x * lngPerX - 180.0

    // can't save much computation here
    const alpha = 2 / numTiles
    const latRad1 = Math.atan(Math.sinh(Math.PI * (1 - y * alpha)));
    const latRad2 = Math.atan(Math.sinh(Math.PI * (1 - (y + 1) * alpha)));

    // convert to degrees
    const degPerRad = 180.0 / Math.PI;
    const latDeg1 = latRad1 * degPerRad
    const latDeg2 = latRad2 * degPerRad

    // calculate extents
    const lngExtent = lngPerX
    const latExtent = latDeg2 - latDeg1

    return [[lngDeg1, latDeg1], [lngExtent, latExtent]];
}

export const clamp = (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max)
}

export const hasOverlap = (
    top_left_1: [number, number],
    extents_1: [number, number],
    top_left_2: [number, number],
    extents_2: [number, number]
) => {
    // Extract coordinates and extents
    const [x1, y1] = top_left_1
    const [w1, h1] = extents_1
    const [x2, y2] = top_left_2
    const [w2, h2] = extents_2

    // Calculate the right-bottom coordinates for both rectangles
    const x1_right = x1 + w1
    const y1_bottom = y1 + h1
    const x2_right = x2 + w2
    const y2_bottom = y2 + h2

    // Check for intersection
    const hasHorizontalOverlap = x1 < x2_right && x1_right > x2
    const hasVerticalOverlap = y1 < y2_bottom && y1_bottom > y2

    // Return true if there's overlap in both horizontal and vertical dimensions
    return hasHorizontalOverlap && hasVerticalOverlap
}

export const getXYExtent = (coords:[number,number], coordsExtents:[number,number], z:number) => {
    const coordX1 = coords[0];
    const coordX2 = coords[0] + coordsExtents[0];
    const coordY1 = coords[1];
    const coordY2 = coords[1] + coordsExtents[1];
    const x1 = lon_degToNum(coordX1,z);
    const x2 = lon_degToNum(coordX2,z);
    const y1 = lat_degToNum(coordY1,z);
    const y2 = lat_degToNum(coordY2,z);
    
    const xmin = Math.min(x1,x2);
    const xmax = Math.max(x1,x2);
    const ymin = Math.min(y1,y2);
    const ymax = Math.max(y1,y2);

    return {xmin,xmax,ymin,ymax};
}


export async function asyncFilter<T>(arr: T[], cb: (el: T) => Promise<boolean>): Promise<T[]> {
    // 1. Use map to create an array of Promises
    const promises = arr.map(async (element) => {
        const needAdd = await cb(element);
        return needAdd ? element : null;
    });

    // 2. Use Promise.all to wait for all promises to resolve
    const results = await Promise.all(promises);

    // 3. Filter out null values (elements that didn't pass the test)
    return results.filter((el) => el !== null) as T[];
}
