#!/bin/bash

# NOTE: this is not asynchonous like I want

# Iterate through each .tif file in the directory
for file in /home/pi/ksayers/dts-node/openrealm_geotiffs/*.tif; do
# for file in /mnt/c/data/gtiff/*.tif; do
    echo "$file"
    curl -i -X POST "http://0.0.0.0:80/image" \
        -H "Content-Type: image/tiff" \
        --data-binary "@$file"
    sleep 1.0
done
