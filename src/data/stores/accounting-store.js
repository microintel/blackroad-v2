import {
    BaseStore
} from "./base-store.js";

import {
    DATABASES
} from "../db-registry.js";


export class AccountingStore
    extends BaseStore {

    constructor() {

        super(
            DATABASES.accounting
        );

    }


    async getAccountingData() {

        const database =
            await this.getDatabase();


        return new Promise(
            (resolve, reject) => {

                const transaction =
                    database.transaction(
                        this.stores.accounting,
                        "readonly"
                    );


                const store =
                    transaction.objectStore(
                        this.stores.accounting
                    );


                const request =
                    store.get(
                        "manual"
                    );


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

}