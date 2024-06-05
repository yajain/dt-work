# Dynamic Tile Service

To run:
```
npm run start
```
## What this does

This is the combined Dynamic Tile Service and Cache Manager for the ATAK Live Mapping system. This is meant to run as a server with a local file storage. This service will act as a geoserver for XYZ tiles (currently, tile fetches are done using gwc notation, but that should probably change). It can also receive new tiles and update the file storage appropriately while also keeping backups of existing tiles (It should probably also handle any tile merging and appropriate tile updates). 

## Endpoints

It has 3 endpoints: 1 which is called by the image sticher and tiler and 2 which are called by the ATAK tablet.

The '/tile' endpoint is where new tiles are sent as a binary body with header 'Content-Type':'image/png'. The tile images are then put in local file storage replacing any existing tile (which is backed up).

The '/fetch' endpoint acts as a standard XYZ map tile server. It retrives the requested tile from local storage and sends it to the client. It also logs the session ID and timestamps the request for use in the bounding box endpoint.

The '/dynamicboundingbox' endpoint is called by the ATAK plugin. The edges of the bounding box are used to search through the available tiles and find those which have been updated since the last time a bounding box request was made. 
Any tiles which have been fetched since the last bounding box call AND have not been re-updated since the last bounding box request are excluded.
This array of tiles is sent to the front end client.

## Generating ca key
```
openssl genrsa -out certs/key.pem 2048
openssl rsa -in certs/key.pem -outform PEM -pubout -out certs/cert.pem
```

## NEXT STEPS

- Change incoming fetch requests to use XYZ notation (can we just drop geoserver?)
- Add tile merging and retiling


## OUTSTANDING QUESTIONS & THOUGHTS

- Do we need to log bounding box requests? It isn't necessary for session-based tile exclusion.
- Why do we need a GeoServer? Why can't the DTS just serve the tiles from the local drive? This would simplify the system since we would not need to make external calls. We can also get rid of a lot of these parameters which geoserver requires, but are just fluff.
