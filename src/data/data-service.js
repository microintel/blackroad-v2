import {
    openDatabase,
    getDatabaseName,
    getDatabaseConfig
} from "./database.js";

import { IncomeStore } from "./stores/income-store.js";

class DataService {
    constructor() {
        this.databases = {};
        this.stores = {};
    }

    async getIncomeStore() {
        if (this.stores.income) {
            return this.stores.income;
        }

        const database =
            await this.getDatabase("income");

        const store = new IncomeStore(database);

        this.stores.income = store;

        return store;
    }

    async getDatabase(moduleName) {
        if (this.databases[moduleName]) {
            return this.databases[moduleName];
        }

        const database =
            await openDatabase(moduleName);

        this.databases[moduleName] = database;

        return database;
    }

    async getDatabaseInfo(moduleName) {
        const database =
            await this.getDatabase(moduleName);

        const config =
            getDatabaseConfig(moduleName);

        return {
            module: moduleName,
            label: config.label,
            name: getDatabaseName(moduleName),
            version: database.version,
            stores: Array.from(
                database.objectStoreNames
            )
        };
    }

    async getSystemInfo() {
        const modules = [
            "income",
            "stocks",
            "lending",
            "deposits",
            "stepup",
            "accounting"
        ];

        const result = {};

        for (const module of modules) {
            try {
                result[module] =
                    await this.getDatabaseInfo(
                        module
                    );
            } catch (error) {
                result[module] = {
                    error: error.message
                };
            }
        }

        return result;
    }
}

export const dataService =
    new DataService();