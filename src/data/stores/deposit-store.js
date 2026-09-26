import {
    BaseStore
} from "./base-store.js";

import {
    DATABASES
} from "../db-registry.js";


export class DepositStore
    extends BaseStore {

    constructor() {

        super(
            DATABASES.deposits
        );

    }


    async getDeposits() {

        return await this.getAll(
            this.stores.deposits
        );

    }


    async countDeposits() {

        return await this.count(
            this.stores.deposits
        );

    }

}