import {
    openDatabase,
    getDatabaseName,
    getDatabaseConfig
} from "./database.js";

import { IncomeStore } from "./stores/income-store.js";
import { StocksStore } from "./stores/stocks-store.js";
import { DepositStore } from "./stores/deposit-store.js";
import { LendingStore } from "./stores/lending-store.js";
import { StepUpStore } from "./stores/stepup-store.js";
import { AccountingStore } from "./stores/accounting-store.js";

const STORE_CLASSES = {
    income: IncomeStore,
    stocks: StocksStore,
    deposits: DepositStore,
    lending: LendingStore,
    stepup: StepUpStore,
    accounting: AccountingStore
};

const MODULES = Object.keys(STORE_CLASSES);

class DataService {
    constructor() {
        this.databases = {};
        this.stores = {};
    }

    async getStore(moduleName) {
        if (this.stores[moduleName]) {
            return this.stores[moduleName];
        }

        const StoreClass = STORE_CLASSES[moduleName];

        if (!StoreClass) {
            throw new Error(
                `Unknown data module: ${moduleName}`
            );
        }

        const database =
            await this.getDatabase(moduleName);

        const store = new StoreClass(database);

        this.stores[moduleName] = store;

        return store;
    }

    getIncomeStore() {
        return this.getStore("income");
    }

    getStocksStore() {
        return this.getStore("stocks");
    }

    getDepositStore() {
        return this.getStore("deposits");
    }

    getLendingStore() {
        return this.getStore("lending");
    }

    getStepUpStore() {
        return this.getStore("stepup");
    }

    getAccountingStore() {
        return this.getStore("accounting");
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
        const result = {};

        for (const module of MODULES) {
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
