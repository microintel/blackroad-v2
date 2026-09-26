import {
    BaseStore
} from "./base-store.js";

import {
    DATABASES
} from "../db-registry.js";


export class LendingStore
    extends BaseStore {

    constructor() {

        super(
            DATABASES.lending
        );

    }


    async getPeople() {

        return await this.getAll(
            this.stores.parties
        );

    }


    async getEntries() {

        return await this.getAll(
            this.stores.entries
        );

    }


    async getLoans() {

        return await this.getAll(
            this.stores.loans
        );

    }


    async countPeople() {

        return await this.count(
            this.stores.parties
        );

    }


    async countEntries() {

        return await this.count(
            this.stores.entries
        );

    }


    async countLoans() {

        return await this.count(
            this.stores.loans
        );

    }

}