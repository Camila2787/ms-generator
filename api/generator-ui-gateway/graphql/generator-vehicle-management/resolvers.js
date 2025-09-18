const { withFilter } = require("graphql-subscriptions");
const { PubSub } = require("graphql-subscriptions");
const pubsub = new PubSub();

const { of } = require("rxjs");
const { map, mergeMap, catchError } = require('rxjs/operators');

let broker = require("../../broker/BrokerFactory")();
broker = broker.secondaryBroker ? broker.secondaryBroker : broker;

const RoleValidator = require('../../tools/RoleValidator');
const { handleError$ } = require('../../tools/GraphqlResponseTools');

const INTERNAL_SERVER_ERROR_CODE = 1;
const PERMISSION_DENIED_ERROR_CODE = 2;
const CONTEXT_NAME = "generator";

const READ_ROLES = ["VEHICLE_READ"];
const WRITE_ROLES = ["VEHICLE_WRITE"];

/**
 * Normaliza la respuesta proveniente del backend (CQRS)
 */
function getResponseFromBackEnd$(response) {
  return of(response).pipe(
    map((resp) => {
      if (resp.result.code != 200) {
        const err = new Error();
        err.name = 'Error';
        err.message = resp.result.error;
        Error.captureStackTrace(err, 'Error');
        throw err;
      }
      return resp.data;
    })
  );
}

/**
 * Envia la operación al microservicio backend usando el broker,
 * validando roles (si se especifican).
 *
 * @param {object} root
 * @param {object} OperationArguments
 * @param {object} context   (de Apollo, incluye authToken/encodedToken)
 * @param {Array} requiredRoles
 * @param {string} operationType  'query' | 'mutation'
 * @param {string} aggregateName   p.e. 'Vehicle'
 * @param {string} methodName      p.e. 'GeneratorStartGeneration'
 * @param {number} timeout
 */
function sendToBackEndHandler$(
  root,
  OperationArguments,
  context,
  requiredRoles,
  operationType,
  aggregateName,
  methodName,
  timeout = 2000
) {
  return RoleValidator.checkPermissions$(
    context.authToken && context.authToken.realm_access ? context.authToken.realm_access.roles : [],
    CONTEXT_NAME,
    methodName,
    PERMISSION_DENIED_ERROR_CODE,
    "Permission denied",
    requiredRoles
  ).pipe(
    mergeMap(() =>
      broker.forwardAndGetReply$(
        aggregateName,
        `generator-uigateway.graphql.${operationType}.${methodName}`,
        { root, args: OperationArguments, jwt: context.encodedToken },
        timeout
      )
    ),
    catchError((err) => handleError$(err, methodName)),
    mergeMap((response) => getResponseFromBackEnd$(response))
  );
}

module.exports = {

  // ========= QUERIES =========
  Query: {
    GeneratorVehicleListing(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context,
        READ_ROLES, 'query', 'Vehicle', 'GeneratorVehicleListing'
      ).toPromise();
    },

    GeneratorVehicle(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context,
        READ_ROLES, 'query', 'Vehicle', 'GeneratorVehicle'
      ).toPromise();
    },

    // NUEVO: STOP como Query
    GeneratorStopGeneration(root, args, context) {
      // Puedes relajar roles en desarrollo usando []
      return sendToBackEndHandler$(
        root, args, context,
        [], 'query', 'Vehicle', 'GeneratorStopGeneration', 5000
      ).toPromise();
    },

    // NUEVO: STATUS como Query
    GeneratorGenerationStatus(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context,
        [], 'query', 'Vehicle', 'GeneratorGenerationStatus', 2000
      ).toPromise();
    }
  },

  // ========= MUTATIONS =========
  Mutation: {
    GeneratorCreateVehicle(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context,
        WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorCreateVehicle'
      ).toPromise();
    },

    GeneratorUpdateVehicle(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context,
        WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorUpdateVehicle'
      ).toPromise();
    },

    GeneratorDeleteVehicles(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context,
        WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorDeleteVehicles'
      ).toPromise();
    },

    // NUEVO: START como Mutation
    GeneratorStartGeneration(root, args, context) {
      // Puedes relajar roles en desarrollo usando []
      return sendToBackEndHandler$(
        root, args, context,
        [], 'mutation', 'Vehicle', 'GeneratorStartGeneration', 5000
      ).toPromise();
    }
  },

  // ========= SUBSCRIPTIONS =========
  Subscription: {
    // Se mantiene la que venía del template
    GeneratorVehicleModified: {
      subscribe: withFilter(
        (payload, variables, context, info) => {
          RoleValidator.checkAndThrowError(
            context.authToken && context.authToken.realm_access ? context.authToken.realm_access.roles : [],
            READ_ROLES,
            "Generator",
            "GeneratorVehicleModified",
            PERMISSION_DENIED_ERROR_CODE,
            "Permission denied"
          );
          return pubsub.asyncIterator("GeneratorVehicleModified");
        },
        (payload, variables) => {
          return payload
            ? (payload.GeneratorVehicleModified.id === variables.id) || (variables.id === "ANY")
            : false;
        }
      )
    },

    // NUEVO: broadcast del estado (sin filtro)
    GeneratorStatus: {
      subscribe: (root, args, context) => {
        // Validación de autenticación más permisiva para desarrollo
        if (!context.authToken) {
          console.warn('GeneratorStatus subscription: No auth token provided');
        }
        return pubsub.asyncIterator("GeneratorStatus");
      }
    },

    // NUEVO: broadcast de cada vehículo generado (sin filtro)
    GeneratorVehicleGenerated: {
      subscribe: (root, args, context) => {
        // Validación de autenticación más permisiva para desarrollo
        if (!context.authToken) {
          console.warn('GeneratorVehicleGenerated subscription: No auth token provided');
        }
        return pubsub.asyncIterator("GeneratorVehicleGenerated");
      }
    }
  }
};


// ========= SUBSCRIPTIONS SOURCES (bridge broker -> GQL) =========
const eventDescriptors = [
  {
    backendEventName: "GeneratorVehicleModified",
    gqlSubscriptionName: "GeneratorVehicleModified",
    dataExtractor: evt => evt.data,
    onError: (error, descriptor) => console.log(`Error processing ${descriptor.backendEventName}`),
    onEvent: (evt, descriptor) => console.log(`Event of type ${descriptor.backendEventName} arrived`)
  },

  // NUEVO: Status push desde backend
  {
    backendEventName: "GeneratorStatus",
    gqlSubscriptionName: "GeneratorStatus",
    dataExtractor: evt => evt.data,
    onError: (error, descriptor) => console.log(`Error processing ${descriptor.backendEventName}`),
    onEvent: (evt, descriptor) => {} // silenciar logs si quieres
  },

  // NUEVO: Cada vehículo generado
  {
    backendEventName: "GeneratorVehicleGenerated",
    gqlSubscriptionName: "GeneratorVehicleGenerated",
    dataExtractor: evt => evt.data,
    onError: (error, descriptor) => console.log(`Error processing ${descriptor.backendEventName}`),
    onEvent: (evt, descriptor) => {} // silenciar logs si quieres
  }
];

/**
 * Conecta cada evento del backend con su subscription de GraphQL
 */
eventDescriptors.forEach(descriptor => {
  broker.getMaterializedViewsUpdates$([descriptor.backendEventName]).subscribe(
    evt => {
      if (descriptor.onEvent) descriptor.onEvent(evt, descriptor);
      const payload = {};
      payload[descriptor.gqlSubscriptionName] = descriptor.dataExtractor
        ? descriptor.dataExtractor(evt)
        : evt.data;
      pubsub.publish(descriptor.gqlSubscriptionName, payload);
    },
    error => {
      if (descriptor.onError) descriptor.onError(error, descriptor);
      console.error(`Error listening ${descriptor.gqlSubscriptionName}`, error);
    },
    () => console.log(`${descriptor.gqlSubscriptionName} listener STOPED.`)
  );
});
