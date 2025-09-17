"use strict";

const uuidv4 = require("uuid/v4");
const { of, forkJoin, from, iif, throwError } = require("rxjs");
const { mergeMap, catchError, map, toArray, pluck } = require('rxjs/operators');

const Event = require("@nebulae/event-store").Event;
const { CqrsResponseHelper } = require('@nebulae/backend-node-tools').cqrs;
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;
const { CustomError, INTERNAL_SERVER_ERROR_CODE, PERMISSION_DENIED } = require("@nebulae/backend-node-tools").error;
const { brokerFactory } = require("@nebulae/backend-node-tools").broker;

const broker = brokerFactory();
const eventSourcing = require("../../tools/event-sourcing").eventSourcing;
const VehicleDA = require("./data-access/VehicleDA");

const READ_ROLES = ["VEHICLE_READ"];
const WRITE_ROLES = ["VEHICLE_WRITE"];
const REQUIRED_ATTRIBUTES = [];
const MATERIALIZED_VIEW_TOPIC = "generator-ui-gateway-materialized-view-updates";

/**
 * Singleton instance
 * @type { VehicleCRUD }
 */
let instance;

class VehicleCRUD {
  constructor() {
  }

  /**     
   * Generates and returns an object that defines the CQRS request handlers.
   * 
   * The map is a relationship of: AGGREGATE_TYPE VS { MESSAGE_TYPE VS  { fn: rxjsFunction, instance: invoker_instance } }
   * 
   * ## Example
   *  { "CreateUser" : { "somegateway.someprotocol.mutation.CreateUser" : {fn: createUser$, instance: classInstance } } }
   */
  generateRequestProcessorMap() {
    return {
      'Vehicle': {
        "generator-uigateway.graphql.query.GeneratorVehicleListing": { fn: instance.getGeneratorVehicleListing$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.query.GeneratorVehicle": { fn: instance.getVehicle$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorCreateVehicle": { fn: instance.createVehicle$, instance, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorUpdateVehicle": { fn: instance.updateVehicle$, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorDeleteVehicles": { fn: instance.deleteVehicles$, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
      }
    }
  };


  /**  
   * Gets the Vehicle list
   *
   * @param {*} args args
   */
  getGeneratorVehicleListing$({ args }, authToken) {
    const { filterInput, paginationInput, sortInput } = args;
    const { queryTotalResultCount = false } = paginationInput || {};

    return forkJoin(
      VehicleDA.getVehicleList$(filterInput, paginationInput, sortInput).pipe(toArray()),
      queryTotalResultCount ? VehicleDA.getVehicleSize$(filterInput) : of(undefined),
    ).pipe(
      map(([listing, queryTotalResultCount]) => ({ listing, queryTotalResultCount })),
      mergeMap(rawResponse => CqrsResponseHelper.buildSuccessResponse$(rawResponse)),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

  /**  
   * Gets the get Vehicle by id
   *
   * @param {*} args args
   */
  getVehicle$({ args }, authToken) {
    const { id, organizationId } = args;
    return VehicleDA.getVehicle$(id, organizationId).pipe(
      mergeMap(rawResponse => CqrsResponseHelper.buildSuccessResponse$(rawResponse)),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );

  }


  /**
  * Create a Vehicle
  */
  createVehicle$({ root, args, jwt }, authToken) {
    const aggregateId = uuidv4();
    const input = {
      active: false,
      ...args.input,
    };

    return VehicleDA.createVehicle$(aggregateId, input, authToken.preferred_username).pipe(
      mergeMap(aggregate => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(aggregate),
        eventSourcing.generator-uitEvent$(instance.buildAggregateMofifiedEvent('CREATE', 'Vehicle', aggregateId, authToken, aggregate), { autoAcknowledgeKey: process.env.MICROBACKEND_KEY }),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, aggregate)
      )),
      map(([sucessResponse]) => sucessResponse),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    )
  }

  /**
   * updates an Vehicle 
   */
  updateVehicle$({ root, args, jwt }, authToken) {
    const { id, input, merge } = args;

    return (merge ? VehicleDA.updateVehicle$ : VehicleDA.replaceVehicle$)(id, input, authToken.preferred_username).pipe(
      mergeMap(aggregate => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(aggregate),
        eventSourcing.generator-uitEvent$(instance.buildAggregateMofifiedEvent(merge ? 'UPDATE_MERGE' : 'UPDATE_REPLACE', 'Vehicle', id, authToken, aggregate), { autoAcknowledgeKey: process.env.MICROBACKEND_KEY }),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, aggregate)
      )),
      map(([sucessResponse]) => sucessResponse),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    )
  }


  /**
   * deletes an Vehicle
   */
  deleteVehicles$({ root, args, jwt }, authToken) {
    const { ids } = args;
    return forkJoin(
      VehicleDA.deleteVehicles$(ids),
      from(ids).pipe(
        mergeMap(id => eventSourcing.generator-uitEvent$(instance.buildAggregateMofifiedEvent('DELETE', 'Vehicle', id, authToken, {}), { autoAcknowledgeKey: process.env.MICROBACKEND_KEY })),
        toArray()
      )
    ).pipe(
      map(([ok, esResps]) => ({ code: ok ? 200 : 400, message: `Vehicle with id:s ${JSON.stringify(ids)} ${ok ? "has been deleted" : "not found for deletion"}` })),
      mergeMap((r) => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(r),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, { id: 'deleted', name: '', active: false, description: '' })
      )),
      map(([cqrsResponse, brokerRes]) => cqrsResponse),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }


  /**
   * Generate an Modified event 
   * @param {string} modType 'CREATE' | 'UPDATE' | 'DELETE'
   * @param {*} aggregateType 
   * @param {*} aggregateId 
   * @param {*} authToken 
   * @param {*} data 
   * @returns {Event}
   */
  buildAggregateMofifiedEvent(modType, aggregateType, aggregateId, authToken, data) {
    return new Event({
      eventType: `${aggregateType}Modified`,
      eventTypeVersion: 1,
      aggregateType: aggregateType,
      aggregateId,
      data: {
        modType,
        ...data
      },
      user: authToken.preferred_username
    })
  }
}

/**
 * @returns {VehicleCRUD}
 */
module.exports = () => {
  if (!instance) {
    instance = new VehicleCRUD();
    ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
