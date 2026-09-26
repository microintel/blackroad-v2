import {
    BaseStore
} from "./base-store.js";

import {
    DATABASES
} from "../db-registry.js";


export class StocksStore
    extends BaseStore {

    constructor() {

        super(
            DATABASES.stocks
        );

    }


    async getState(
        key
    ) {

        const database =
            await this.getDatabase();


        return new Promise(
            (resolve, reject) => {

                const transaction =
                    database.transaction(
                        this.stores.state,
                        "readonly"
                    );


                const store =
                    transaction.objectStore(
                        this.stores.state
                    );


                const request =
                    store.get(key);


                request.onsuccess =
                    () => {

                        resolve(
                            request.result
                        );

                    };


                request.onerror =
                    () => {

                        reject(
                            request.error
                        );

                    };

            }
        );

    }


    async getAllState() {

        return await this.getAll(
            this.stores.state
        );

    }

}