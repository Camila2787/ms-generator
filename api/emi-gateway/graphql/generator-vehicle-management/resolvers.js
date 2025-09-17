const { withFilter, PubSub } = require("graphql-subscriptions");
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

function getResponseFromBackEnd$(response) {
  return of(response).pipe(
    map(resp => {
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
 * Envia la operación al backend validando roles
 */
function sendToBackEndHandler$(
  root,
  OperationArguments,
  context,
  requiredRoles,
  operationType,   // 'query' | 'mutation'
  aggregateName,   // 'Vehicle'
  methodName,      // p.ej. 'GeneratorStartGeneration'
  timeout = 2000
) {
  return RoleValidator.checkPermissions$(
    context.authToken.realm_access.roles,
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
    catchError(err => handleError$(err, methodName)),
    mergeMap(response => getResponseFromBackEnd$(response))
  );
}

module.exports = {

  //// QUERY ///////
  Query: {
    GeneratorVehicleListing(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorVehicleListing'
      ).toPromise();
    },
    GeneratorVehicle(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorVehicle'
      ).toPromise();
    },

    // === NUEVO: STOP como Query ===
    GeneratorStopGeneration(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorStopGeneration',5000
      ).toPromise();
    },
  },

  //// MUTATIONS ///////
  Mutation: {
    GeneratorCreateVehicle(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorCreateVehicle'
      ).toPromise();
    },
    GeneratorUpdateVehicle(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorUpdateVehicle'
      ).toPromise();
    },
    GeneratorDeleteVehicles(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorDeleteVehicles'
      ).toPromise();
    },

    // === NUEVO: START como Mutation ===
    GeneratorStartGeneration(root, args, context) {
      return sendToBackEndHandler$(
        root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorStartGeneration', 5000
      ).toPromise();
    },
  },

  //// SUBSCRIPTIONS ///////
  Subscription: {
    GeneratorVehicleModified: {
      subscribe: withFilter(
        (payload, variables, context) => {
          // valida roles
          RoleValidator.checkAndThrowError(
            context.authToken.realm_access.roles,
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
    }
  }
};

// ==== SUBSCRIPTIONS SOURCES ====

const eventDescriptors = [
  {
    backendEventName: "GeneratorVehicleModified",
    gqlSubscriptionName: "GeneratorVehicleModified",
    dataExtractor: evt => evt.data,
    onError: (error, descriptor) =>
      console.log(`Error processing ${descriptor.backendEventName}`),
    onEvent: (evt, descriptor) =>
      console.log(`Event of type  ${descriptor.backendEventName} arrived`)
  }
];

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
