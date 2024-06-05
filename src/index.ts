import { createServer } from "https"
import express, { Express } from 'express';
import * as dotenv from 'dotenv';
import "reflect-metadata"; //TypeORM requirement
import { DataSource } from "typeorm"

import ExpressSession from "express-session";
import { TypeormStore } from "connect-typeorm";
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from "fs"

import { rootRouter } from './routes';

import { Tile } from "./entity/tile.entity"
import { Session } from './entity/session.entity';
import { BbLog } from './entity/bbLog.entity';
import { FetchLog } from './entity/fetchLog.entity';
import { Layer } from './entity/layer.entity';


dotenv.config();

const app: Express = express();
const port: number = parseInt(process.env.APP_PORT!);

//////////
// We are creating a connection to the database at the beginning, so that we can connect the session tracker to the database.
// Once the database connection is established and the session tracking in place, we add the routes and begin listening on the port.
// The dataSource is exportable from here (index.ts) and will be imported by any services that need access to the database.
//////////

// Database connection definition
// Create an exportable `DataSource` to allow access everywhere
// See: https://typeorm.io/data-source-options for options
export const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  logging: false,
  entities: [Tile,Session, BbLog, FetchLog,Layer],
  migrations: [],
  subscribers: [],
});


// See: https://www.npmjs.com/package/connect-typeorm for documentation
// This: https://github.com/freshgiammi-lab/connect-typeorm/issues/37 has an up to date express-session use for latest Express & TypeORM (as of 11/27/2023)
const sessionStore = new TypeormStore({
  cleanupLimit: 2,
  // ttl: 86400,  //using maxAge
})

// Initialize DataSource, then attach session middleware
dataSource.initialize()
.then(async () => {
    const sessionRepository = dataSource.getRepository(Session);
    app.use(
        ExpressSession({
            // See: https://expressjs.com/en/resources/middleware/session.html for setting options
            resave: false,
            saveUninitialized: false,
            store: sessionStore.connect(sessionRepository),
            secret: process.env.SESSION_SECRET!,
            cookie:{
              maxAge: 1000 * 60 * 2  // Keep session active for 2 minutes
            },
            genid: function(req){ // This changes how IDs are generated for sessions. We'll just use uuid.
              return uuidv4();
            }
        })
    ).use('/', rootRouter); // Once the middleware is attached, attach the routes.
}).catch((error) => console.log(error));


const options = {
  key: readFileSync("./certs/key.pem"),
  cert: readFileSync("./certs/cert.pem"),
  passphrase: "greensight"
}

if (process.env.USE_TLS == "1") {
  createServer(options, app).listen(port, () => {
    console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
  });
} else {
  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
  });
}
