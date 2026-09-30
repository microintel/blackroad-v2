import {
    listDatabases,
    openDatabase
} from "./database.js";


export async function inspectDatabases() {

    if (
        typeof indexedDB.databases !== "function"
    ) {

        console.warn(
            "This browser does not support IndexedDB database discovery."
        );

        return [];

    }


    const databaseList =
        await listDatabases();


    const results = [];


    for (const databaseInfo of databaseList) {

        if (!databaseInfo.name) {
            continue;
        }


        try {

            const database =
                await openDatabase(
                    databaseInfo.name
                );


            results.push({

                name:
                    database.name,

                version:
                    database.version,

                stores:
                    Array.from(
                        database.objectStoreNames
                    )

            });

        } catch (error) {

            results.push({

                name:
                    databaseInfo.name,

                version:
                    databaseInfo.version || null,

                stores: [],

                error:
                    error.message

            });

        }

    }


    return results;

}