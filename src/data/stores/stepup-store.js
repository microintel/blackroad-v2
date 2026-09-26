import {
    BaseStore
} from "./base-store.js";

import {
    DATABASES
} from "../db-registry.js";


export class StepUpStore
    extends BaseStore {

    constructor() {

        super(
            DATABASES.stepup
        );

    }


    async getSettings() {

        return await this.getAll(
            this.stores.settings
        );

    }


    async getEntries() {

        return await this.getAll(
            this.stores.entries
        );

    }


    async getProfiles() {

        return await this.getAll(
            this.stores.profiles
        );

    }

}