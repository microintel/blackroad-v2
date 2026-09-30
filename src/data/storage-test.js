import {
    checkStorage
} from "./data-service.js";


export async function runStorageTest() {

    console.group(
        "BlackRoad Storage Test"
    );


    try {

        const result =
            await checkStorage();


        Object.entries(result)
            .forEach(
                ([module, information]) => {

                    console.log(
                        module,
                        information
                    );

                }
            );


        console.log(
            "Storage layer initialized successfully."
        );


        return result;

    } catch (error) {

        console.error(
            "Storage test failed:",
            error
        );


        throw error;

    } finally {

        console.groupEnd();

    }

}