'use strict'

const { iif } = require("rxjs");
const { tap } = require('rxjs/operators');
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;

const VehicleDA = require("./data-access/VehicleDA");
/**
 * Singleton instance
 * @type { VehicleES }
 */
let instance;

class VehicleES {

    constructor() {
    }

    /**     
     * Generates and returns an object that defines the Event-Sourcing events handlers.
     * 
     * The map is a relationship of: AGGREGATE_TYPE VS { EVENT_TYPE VS  { fn: rxjsFunction, instance: invoker_instance } }
     * 
     * ## Example
     *  { "User" : { "UserAdded" : {fn: handleUserAdded$, instance: classInstance } } }
     */
    generateEventProcessorMap() {
        return {
            'Vehicle': {
                "VehicleModified": { fn: instance.handleVehicleModified$, instance, processOnlyOnSync: true },
            }
        }
    };

    /**
     * Using the VehicleModified events restores the MaterializedView
     * This is just a recovery strategy
     * @param {*} VehicleModifiedEvent Vehicle Modified Event
     */
    handleVehicleModified$({ etv, aid, av, data, user, timestamp }) {
        const aggregateDataMapper = [
            /*etv=0 mapper*/ () => { throw new Error('etv 0 is not an option') },
            /*etv=1 mapper*/ (eventData) => { return { ...eventData, modType: undefined }; }
        ];
        delete aggregateDataMapper.modType;
        const aggregateData = aggregateDataMapper[etv](data);
        return iif(
            () => (data.modType === 'DELETE'),
            VehicleDA.deleteVehicle$(aid),
            VehicleDA.updateVehicleFromRecovery$(aid, aggregateData, av)
        ).pipe(
            tap(() => ConsoleLogger.i(`VehicleES.handleVehicleModified: ${data.modType}: aid=${aid}, timestamp=${timestamp}`))
        )
    }
}


/**
 * @returns {VehicleES}
 */
module.exports = () => {
    if (!instance) {
        instance = new VehicleES();
        ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
    }
    return instance;
};