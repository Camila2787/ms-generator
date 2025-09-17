"use strict";

const uuidv4 = require("uuid/v4");
const { of, forkJoin, from, iif, throwError, Subject, interval } = require("rxjs");
const { mergeMap, catchError, map, toArray, pluck, takeUntil } = require('rxjs/operators');
const crypto = require('crypto');

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

// Topics
const MATERIALIZED_VIEW_TOPIC = "generator-ui-gateway-materialized-view-updates";
const MQTT_TOPIC = "fleet/vehicles/generated";

/**
 * Estado del generador (en memoria)
 */
const genState = {
  running: false,
  stop$: null,
  sub: null,
  total: 0
};

// ===== utilidades de generación =====
function rand(min, max){ return min + Math.floor(Math.random() * (max - min + 1)); }
function randomVehicleData(){
  const types = ['SUV','PickUp','Sedan'];
  const powerSources = ['Electric','Hybrid','Gas'];
  return {
    type: types[rand(0, types.length-1)],
    powerSource: powerSources[rand(0, powerSources.length-1)],
    hp: rand(75, 300),
    year: rand(1980, 2025),
    topSpeed: rand(120, 320)
  };
}
function canonical(v){
  // orden estable = clave para hash idéntico ante los mismos datos
  return `${v.type}|${v.powerSource}|${v.hp}|${v.year}|${v.topSpeed}`;
}
function makeAid(v){
  return crypto.createHash('sha256').update(canonical(v)).digest('hex');
}
function publishStatus(){
  const status = {
    isGenerating: genState.running,
    generatedCount: genState.total,
    status: genState.running ? 'Corriendo…' : 'Detenido'
  };
  broker.send$(MATERIALIZED_VIEW_TOPIC, "GeneratorStatus", status).subscribe({
    error: (e) => ConsoleLogger.e(`Error publishing status: ${e && e.message || e}`)
  });
}
function publishVehicle(evt){
  // a MQTT (para ms-reporter)
  broker.send$(MQTT_TOPIC, "VehicleGenerated", evt).subscribe({
    error: (e) => ConsoleLogger.e(`MQTT publish error: ${e && e.message || e}`)
  });
  // a Gateway (para subscriptions del front)
  broker.send$(MATERIALIZED_VIEW_TOPIC, "GeneratorVehicleGenerated", evt).subscribe({
    error: (e) => ConsoleLogger.e(`MV publish error: ${e && e.message || e}`)
  });
}

/**
 * Singleton instance
 * @type { VehicleCRUD }
 */
let instance;

class VehicleCRUD {
  constructor() {}

  /**
   * Mapa de handlers CQRS
   */
  generateRequestProcessorMap() {
    return {
      'Vehicle': {
        // --- CRUD que ya traía el template ---
        "generator-uigateway.graphql.query.GeneratorVehicleListing": { fn: instance.getGeneratorVehicleListing$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.query.GeneratorVehicle": { fn: instance.getVehicle$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorCreateVehicle": { fn: instance.createVehicle$, instance, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorUpdateVehicle": { fn: instance.updateVehicle$, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorDeleteVehicles": { fn: instance.deleteVehicles$, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },

        // --- NUEVO: control del generador ---
        // Nota: en dev puedes dejar roles vacíos [] para evitar JWT;
        // si ya tienes Keycloak listo, cambia [] -> WRITE_ROLES/READ_ROLES.
        "generator-uigateway.graphql.mutation.GeneratorStartGeneration": { fn: instance.GeneratorStartGeneration$, instance, jwtValidation: { roles: [], attributes: [] } },
        "generator-uigateway.graphql.query.GeneratorStopGeneration": { fn: instance.GeneratorStopGeneration$, instance, jwtValidation: { roles: [], attributes: [] } },
        "generator-uigateway.graphql.query.GeneratorGenerationStatus": { fn: instance.GeneratorGenerationStatus$, instance, jwtValidation: { roles: [], attributes: [] } },
      }
    }
  };

  // ====== CRUD (como venía) ======

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

  getVehicle$({ args }, authToken) {
    const { id, organizationId } = args;
    return VehicleDA.getVehicle$(id, organizationId).pipe(
      mergeMap(rawResponse => CqrsResponseHelper.buildSuccessResponse$(rawResponse)),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

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

  // ====== NUEVO: Start / Stop / Status ======

  GeneratorStartGeneration$() {
    if (genState.running) {
      publishStatus();
      return of({ code: 200, message: 'Generator already running' })
        .pipe(mergeMap(CqrsResponseHelper.buildSuccessResponse$));
    }

    genState.stop$ = new Subject();
    genState.running = true;

    genState.sub = interval(50).pipe(takeUntil(genState.stop$)).subscribe({
      next: () => {
        const data = randomVehicleData();
        const evt = {
          at: 'Vehicle',
          et: 'Generated',
          aid: makeAid(data),
          timestamp: new Date().toISOString(),
          data
        };
        genState.total += 1;
        publishVehicle(evt);
      },
      error: (e) => ConsoleLogger.e(`stream error: ${e && e.message || e}`),
      complete: () => ConsoleLogger.i('stream completed')
    });

    publishStatus();
    return of({ code: 200, message: 'Generation started' })
      .pipe(mergeMap(CqrsResponseHelper.buildSuccessResponse$));
  }

  GeneratorStopGeneration$() {
    if (!genState.running) {
      publishStatus();
      return of({ code: 200, message: 'Generator already stopped' })
        .pipe(mergeMap(CqrsResponseHelper.buildSuccessResponse$));
    }

    try { genState.stop$.next(true); genState.stop$.complete(); } catch(_) {}
    try { if (genState.sub) genState.sub.unsubscribe(); } catch(_) {}
    genState.stop$ = null;
    genState.sub = null;
    genState.running = false;

    publishStatus();
    return of({ code: 200, message: 'Generation stopped' })
      .pipe(mergeMap(CqrsResponseHelper.buildSuccessResponse$));
  }

  GeneratorGenerationStatus$() {
    const s = {
      isGenerating: genState.running,
      generatedCount: genState.total,
      status: genState.running ? 'Corriendo…' : 'Detenido'
    };
    return of(s).pipe(mergeMap(CqrsResponseHelper.buildSuccessResponse$));
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
