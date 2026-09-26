import {
    inspectDatabases
} from "./inspector.js";

import {
    openDatabase
} from "./database.js";

import {
    inspectStore
} from "./inspect-store.js";


export async function createStorageReport() {

    const databases =
        await inspectDatabases();


    const report = [];


    for (const databaseInfo of databases) {

        const database =
            await openDatabase(
                databaseInfo.name
            );


        const stores = [];


        for (
            const storeName
            of databaseInfo.stores
        ) {

            try {

                const records =
                    await inspectStore(
                        database,
                        storeName
                    );


                stores.push({

                    name:
                        storeName,

                    recordCount:
                        records.length,

                    sample:
                        records.slice(0, 3)

                });

            } catch (error) {

                stores.push({

                    name:
                        storeName,

                    recordCount:
                        null,

                    sample: [],

                    error:
                        error.message

                });

            }

        }


        report.push({

            name:
                databaseInfo.name,

            version:
                databaseInfo.version,

            stores

        });

    }


    return report;
}