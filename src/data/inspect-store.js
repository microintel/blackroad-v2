export async function inspectStore(
    database,
    storeName
) {

    if (
        !database.objectStoreNames.contains(
            storeName
        )
    ) {

        throw new Error(
            `Object store "${storeName}" does not exist.`
        );

    }


    return new Promise(
        (resolve, reject) => {

            const transaction =
                database.transaction(
                    storeName,
                    "readonly"
                );


            const store =
                transaction.objectStore(
                    storeName
                );


            const request =
                store.getAll();


            request.onsuccess = () => {

                resolve(
                    request.result
                );

            };


            request.onerror = () => {

                reject(
                    request.error
                );

            };

        }
    );
}