"use strict";

const uuidv4 = require("uuid/v4");
const { of, forkJoin, from, Subject, interval, iif, throwError } = require("rxjs");
const { mergeMap, catchError, map, toArray, takeUntil } = require('rxjs/operators');

const crypto = require('crypto');

const Event = require("@nebulae/event-store").Event;
const { CqrsResponseHelper } = require('@nebulae/backend-node-tools').cqrs;
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;
const { CustomError } = require("@nebulae/backend-node-tools").error;
const { brokerFactory } = require("@nebulae/backend-node-tools").broker;

const broker = brokerFactory();
const eventSourcing = require("../../tools/event-sourcing").eventSourcing;
const VehicleDA = require("./data-access/VehicleDA");

const READ_ROLES = ["VEHICLE_READ"];
const WRITE_ROLES = ["VEHICLE_WRITE"];
const REQUIRED_ATTRIBUTES = [];

// Tópico para MV que ya usa el template
const MATERIALIZED_VIEW_TOPIC = "generator-ui-gateway-materialized-view-updates";

// === Config de publicación de eventos generados (requerimiento) ===
const MQTT_TOPIC_GENERATED = process.env.MQTT_TOPIC_GENERATED || "fleet/vehicles/generated";

// === Estado del generador ===
let isGenerating = false;
let generatedCount = 0;
const stop$ = new Subject();

/** Utils random + AID */
const TYPES = ["SUV", "PickUp", "Sedan"];
const POWER = ["Electric", "Hybrid", "Gas"];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function canonicalVehicle(v) {
  // orden estable para el hash
  return `${v.type}|${v.powerSource}|${v.hp}|${v.year}|${v.topSpeed}`;
}
function makeAid(v) {
  return crypto.createHash('sha256').update(canonicalVehicle(v)).digest('hex');
}

// Singleton instance
let instance;

class VehicleCRUD {
  constructor() {}

  /**
   * Mapa de handlers CQRS
   */
  generateRequestProcessorMap() {
    return {
      'Vehicle': {
        // === LISTING / CRUD existentes ===
        "generator-uigateway.graphql.query.GeneratorVehicleListing": { fn: instance.getGeneratorVehicleListing$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.query.GeneratorVehicle": { fn: instance.getVehicle$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorCreateVehicle": { fn: instance.createVehicle$, instance, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorUpdateVehicle": { fn: instance.updateVehicle$, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorDeleteVehicles": { fn: instance.deleteVehicles$, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },

        // === NUEVOS: CONTROL DEL GENERADOR ===
        // Start = Mutation (WRITE)
        "generator-uigateway.graphql.mutation.GeneratorStartGeneration": { fn: instance.startGeneration$, instance, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        // Stop  = Query (READ)
        "generator-uigateway.graphql.query.GeneratorStopGeneration": { fn: instance.stopGeneration$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
      }
    }
  };

  /**  
   * Gets the Vehicle list
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
   * Gets the Vehicle by id
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
    const input = { active: false, ...args.input };

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
   * updates a Vehicle 
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
   * deletes Vehicles
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
      map(([ok]) => ({ code: ok ? 200 : 400, message: `Vehicle with id:s ${JSON.stringify(ids)} ${ok ? "has been deleted" : "not found for deletion"}` })),
      mergeMap((r) => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(r),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, { id: 'deleted', name: '', active: false, description: '' })
      )),
      map(([cqrsResponse]) => cqrsResponse),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

  // ========= NUEVO: CONTROL DEL GENERADOR =========

  /**
   * START (Mutation)
   * - Inicia interval(50) hasta que llegue stop$
   * - Publica cada vehículo en el tópico MQTT_TOPIC_GENERATED vía broker
   */
  startGeneration$({ root, args, jwt }, authToken) {
    if (isGenerating) {
      ConsoleLogger.w(`[Generator] Already running. user=${authToken && authToken.preferred_username}`);
      return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: `Generator already running. total=${generatedCount}` });
    }

    ConsoleLogger.i(`[Generator] START requested by ${authToken && authToken.preferred_username}`);
    isGenerating = true;

    interval(50).pipe(takeUntil(stop$)).subscribe({
      next: () => {
        const data = {
          type: pick(TYPES),
          powerSource: pick(POWER),
          hp: randInt(75, 300),
          year: randInt(1980, 2025),
          topSpeed: randInt(120, 320),
        };
        const msg = {
          at: 'Vehicle',
          et: 'Generated',
          aid: makeAid(data),
          timestamp: new Date().toISOString(),
          data
        };
        // Publicar por broker al tópico requerido
        broker.send$(MQTT_TOPIC_GENERATED, 'VehicleGenerated', msg).subscribe(
          () => {},
          err => ConsoleLogger.e(`[Generator] publish error: ${err && err.message}`),
          () => {}
        );
        generatedCount++;
      },
      error: (err) => {
        ConsoleLogger.e(`[Generator] stream error: ${err && err.message}`);
      },
      complete: () => {
        ConsoleLogger.i(`[Generator] stream completed`);
      }
    });

    return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: 'Generator started' });
  }

  /**
   * STOP (Query)
   * - Detiene el stream
   */
  stopGeneration$({ root, args, jwt }, authToken) {
    if (!isGenerating) {
      ConsoleLogger.w(`[Generator] Stop requested but generator is not running`);
      return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: 'Generator already stopped' });
    }
    ConsoleLogger.i(`[Generator] STOP requested by ${authToken && authToken.preferred_username}`);
    stop$.next(true);
    isGenerating = false;
    return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: `Generator stopped. total=${generatedCount}` });
  }

  /**
   * Build Modified Event 
   */
  buildAggregateMofifiedEvent(modType, aggregateType, aggregateId, authToken, data) {
    return new Event({
      eventType: `${aggregateType}Modified`,
      eventTypeVersion: 1,
      aggregateType: aggregateType,
      aggregateId,
      data: { modType, ...data },
      user: authToken.preferred_username
    })
  }
}

/** @returns {VehicleCRUD} */
module.exports = () => {
  if (!instance) {
    instance = new VehicleCRUD();
    ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
