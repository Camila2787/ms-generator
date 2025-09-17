"use strict";

const uuidv4 = require("uuid/v4");
const { of, forkJoin, from, Subject, interval, iif, throwError } = require("rxjs");
const { mergeMap, catchError, map, toArray, takeUntil } = require('rxjs/operators');
const crypto = require('crypto');

const Event = require("@nebulae/event-store").Event;
const { CqrsResponseHelper } = require('@nebulae/backend-node-tools').cqrs;
const { ConsoleLogger } = require('@nebulae/backend-node-tools').log;
const { brokerFactory } = require("@nebulae/backend-node-tools").broker;

const broker = brokerFactory();
const eventSourcing = require("../../tools/event-sourcing").eventSourcing;
const VehicleDA = require("./data-access/VehicleDA");

const READ_ROLES = ["VEHICLE_READ"];
const WRITE_ROLES = ["VEHICLE_WRITE"];
const REQUIRED_ATTRIBUTES = [];

// Tópico MV (usado por el gateway para empujar vía WS)
const MATERIALIZED_VIEW_TOPIC = "generator-ui-gateway-materialized-view-updates";

// Tópico MQTT de la consigna
const MQTT_TOPIC_GENERATED = process.env.MQTT_TOPIC_GENERATED || "fleet/vehicles/generated";

// Estado del generador
let isGenerating = false;
let generatedCount = 0;
const stop$ = new Subject();

// utils aleatorios + AID
const TYPES = ["SUV", "PickUp", "Sedan"];
const POWER = ["Electric", "Hybrid", "Gas"];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const canonicalVehicle = v => `${v.type}|${v.powerSource}|${v.hp}|${v.year}|${v.topSpeed}`;
const makeAid = v => crypto.createHash('sha256').update(canonicalVehicle(v)).digest('hex');

let instance;

class VehicleCRUD {
  constructor() {}

  generateRequestProcessorMap() {
    return {
      'Vehicle': {
        // CRUD existentes
        "generator-uigateway.graphql.query.GeneratorVehicleListing":  { fn: instance.getGeneratorVehicleListing$, instance, jwtValidation: { roles: READ_ROLES,  attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.query.GeneratorVehicle":         { fn: instance.getVehicle$,                 instance, jwtValidation: { roles: READ_ROLES,  attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorCreateVehicle":{ fn: instance.createVehicle$,              instance, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorUpdateVehicle":{ fn: instance.updateVehicle$,                        jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.mutation.GeneratorDeleteVehicles":{ fn: instance.deleteVehicles$,                      jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },

        // Control del generador
        "generator-uigateway.graphql.mutation.GeneratorStartGeneration": { fn: instance.startGeneration$, instance, jwtValidation: { roles: WRITE_ROLES, attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.query.GeneratorStopGeneration":     { fn: instance.stopGeneration$,  instance, jwtValidation: { roles: READ_ROLES,  attributes: REQUIRED_ATTRIBUTES } },
        "generator-uigateway.graphql.query.GeneratorGenerationStatus":   { fn: instance.getGenerationStatus$, instance, jwtValidation: { roles: READ_ROLES, attributes: REQUIRED_ATTRIBUTES } },
      }
    }
  };

  // ===== Listado / CRUD =====
  getGeneratorVehicleListing$({ args }) {
    const { filterInput, paginationInput, sortInput } = args;
    const { queryTotalResultCount = false } = paginationInput || {};
    return forkJoin(
      VehicleDA.getVehicleList$(filterInput, paginationInput, sortInput).pipe(toArray()),
      queryTotalResultCount ? VehicleDA.getVehicleSize$(filterInput) : of(undefined),
    ).pipe(
      map(([listing, queryTotalResultCount]) => ({ listing, queryTotalResultCount })),
      mergeMap(raw => CqrsResponseHelper.buildSuccessResponse$(raw)),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

  getVehicle$({ args }) {
    const { id, organizationId } = args;
    return VehicleDA.getVehicle$(id, organizationId).pipe(
      mergeMap(raw => CqrsResponseHelper.buildSuccessResponse$(raw)),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

  createVehicle$({ root, args }, authToken) {
    const aggregateId = uuidv4();
    const input = { active: false, ...args.input };
    return VehicleDA.createVehicle$(aggregateId, input, authToken.preferred_username).pipe(
      mergeMap(aggregate => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(aggregate),
        eventSourcing.generator-uitEvent$(instance.buildAggregateMofifiedEvent('CREATE', 'Vehicle', aggregateId, authToken, aggregate), { autoAcknowledgeKey: process.env.MICROBACKEND_KEY }),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, aggregate)
      )),
      map(([res]) => res),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    )
  }

  updateVehicle$({ root, args }, authToken) {
    const { id, input, merge } = args;
    return (merge ? VehicleDA.updateVehicle$ : VehicleDA.replaceVehicle$)(id, input, authToken.preferred_username).pipe(
      mergeMap(aggregate => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(aggregate),
        eventSourcing.generator-uitEvent$(instance.buildAggregateMofifiedEvent(merge ? 'UPDATE_MERGE' : 'UPDATE_REPLACE', 'Vehicle', id, authToken, aggregate), { autoAcknowledgeKey: process.env.MICROBACKEND_KEY }),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, aggregate)
      )),
      map(([res]) => res),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    )
  }

  deleteVehicles$({ root, args }, authToken) {
    const { ids } = args;
    return forkJoin(
      VehicleDA.deleteVehicles$(ids),
      from(ids).pipe(
        mergeMap(id => eventSourcing.generator-uitEvent$(instance.buildAggregateMofifiedEvent('DELETE', 'Vehicle', id, authToken, {}), { autoAcknowledgeKey: process.env.MICROBACKEND_KEY })),
        toArray()
      )
    ).pipe(
      map(([ok]) => ({ code: ok ? 200 : 400, message: `Vehicle with id:s ${JSON.stringify(ids)} ${ok ? "has been deleted" : "not found for deletion"}` })),
      mergeMap(r => forkJoin(
        CqrsResponseHelper.buildSuccessResponse$(r),
        broker.send$(MATERIALIZED_VIEW_TOPIC, `GeneratorVehicleModified`, { id: 'deleted', name: '', active: false, description: '' })
      )),
      map(([cqrs]) => cqrs),
      catchError(err => iif(() => err.name === 'MongoTimeoutError', throwError(err), CqrsResponseHelper.handleError$(err)))
    );
  }

  // ===== Status (Query) =====
  getGenerationStatus$() {
    const status = isGenerating ? 'RUNNING' : 'STOPPED';
    return CqrsResponseHelper.buildSuccessResponse$({ isGenerating, generatedCount, status });
  }

  // ===== START (Mutation) =====
  startGeneration$({ root, args }, authToken) {
    if (isGenerating) {
      ConsoleLogger.w(`[Generator] Already running. user=${authToken && authToken.preferred_username}`);
      return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: `Generator already running. total=${generatedCount}` });
    }
    ConsoleLogger.i(`[Generator] START requested by ${authToken && authToken.preferred_username}`);
    isGenerating = true;

    // >>> publica estado RUNNING a MV <<<
    broker.send$(MATERIALIZED_VIEW_TOPIC, 'GeneratorStatus', {
      isGenerating: true,
      generatedCount,
      status: 'RUNNING'
    }).subscribe();

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

        // Publica al tópico MQTT (consignas)
        broker.send$(MQTT_TOPIC_GENERATED, 'VehicleGenerated', msg).subscribe();

        // >>> publica evento a MV para WS <<<
        broker.send$(MATERIALIZED_VIEW_TOPIC, 'GeneratorVehicleGenerated', msg).subscribe();

        generatedCount++;
      },
      error: err => ConsoleLogger.e(`[Generator] stream error: ${err && err.message}`),
      complete: () => ConsoleLogger.i(`[Generator] stream completed`)
    });

    return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: 'Generator started' });
  }

  // ===== STOP (Query) =====
  stopGeneration$({ root, args }, authToken) {
    if (!isGenerating) {
      ConsoleLogger.w(`[Generator] Stop requested but generator is not running`);
      // igual avisa estado
      broker.send$(MATERIALIZED_VIEW_TOPIC, 'GeneratorStatus', {
        isGenerating: false,
        generatedCount,
        status: 'STOPPED'
      }).subscribe();
      return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: 'Generator already stopped' });
    }
    ConsoleLogger.i(`[Generator] STOP requested by ${authToken && authToken.preferred_username}`);
    stop$.next(true);
    isGenerating = false;

    // >>> publica estado STOPPED a MV <<<
    broker.send$(MATERIALIZED_VIEW_TOPIC, 'GeneratorStatus', {
      isGenerating: false,
      generatedCount,
      status: 'STOPPED'
    }).subscribe();

    return CqrsResponseHelper.buildSuccessResponse$({ code: 200, message: `Generator stopped. total=${generatedCount}` });
  }

  buildAggregateMofifiedEvent(modType, aggregateType, aggregateId, authToken, data) {
    return new Event({
      eventType: `${aggregateType}Modified`,
      eventTypeVersion: 1,
      aggregateType,
      aggregateId,
      data: { modType, ...data },
      user: authToken.preferred_username
    })
  }
}

module.exports = () => {
  if (!instance) {
    instance = new VehicleCRUD();
    ConsoleLogger.i(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
