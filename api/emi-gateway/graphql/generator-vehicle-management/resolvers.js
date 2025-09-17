const { withFilter, PubSub } = require("graphql-subscriptions");
const pubsub = new PubSub();
const { of } = require("rxjs");
const { map, mergeMap, catchError } = require('rxjs/operators');
let broker = require("../../broker/BrokerFactory")();
broker = broker.secondaryBroker ? broker.secondaryBroker : broker;

const RoleValidator = require('../../tools/RoleValidator');
const { handleError$ } = require('../../tools/GraphqlResponseTools');

const PERMISSION_DENIED_ERROR_CODE = 2;
const CONTEXT_NAME = "generator";

const READ_ROLES = ["VEHICLE_READ"];
const WRITE_ROLES = ["VEHICLE_WRITE"];

function getResponseFromBackEnd$(response) {
  return of(response).pipe(
    map(resp => {
      if (resp.result.code !== 200) {
        const err = new Error();
        err.name = 'Error';
        err.message = typeof resp.result.error === 'string'
          ? resp.result.error
          : JSON.stringify(resp.result.error || resp.result);
        Error.captureStackTrace(err, 'Error');
        throw err;
      }
      return resp.data;
    })
  );
}

function sendToBackEndHandler$(
  root, OperationArguments, context, requiredRoles,
  operationType, aggregateName, methodName, timeout = 2000
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
  Query: {
    GeneratorVehicleListing(root, args, context) {
      return sendToBackEndHandler$(root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorVehicleListing').toPromise();
    },
    GeneratorVehicle(root, args, context) {
      return sendToBackEndHandler$(root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorVehicle').toPromise();
    },
    GeneratorStopGeneration(root, args, context) {
      return sendToBackEndHandler$(root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorStopGeneration', 5000).toPromise();
    },
    GeneratorGenerationStatus(root, args, context) {
      return sendToBackEndHandler$(root, args, context, READ_ROLES, 'query', 'Vehicle', 'GeneratorGenerationStatus', 5000).toPromise();
    },
  },

  Mutation: {
    GeneratorCreateVehicle(root, args, context) {
      return sendToBackEndHandler$(root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorCreateVehicle').toPromise();
    },
    GeneratorUpdateVehicle(root, args, context) {
      return sendToBackEndHandler$(root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorUpdateVehicle').toPromise();
    },
    GeneratorDeleteVehicles(root, args, context) {
      return sendToBackEndHandler$(root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorDeleteVehicles').toPromise();
    },
    GeneratorStartGeneration(root, args, context) {
      return sendToBackEndHandler$(root, args, context, WRITE_ROLES, 'mutation', 'Vehicle', 'GeneratorStartGeneration', 5000).toPromise();
    },
  },

  Subscription: {
    // ya existía
    GeneratorVehicleModified: {
      subscribe: withFilter(
        (payload, variables, context) => {
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
    },

    // NUEVO: estado del generador
    GeneratorStatus: {
      subscribe: withFilter(
        (payload, variables, context) => {
          RoleValidator.checkAndThrowError(
            context.authToken.realm_access.roles,
            READ_ROLES,
            "Generator",
            "GeneratorStatus",
            PERMISSION_DENIED_ERROR_CODE,
            "Permission denied"
          );
          return pubsub.asyncIterator("GeneratorStatus");
        },
        () => true
      )
    },

    // NUEVO: vehículo generado
    GeneratorVehicleGenerated: {
      subscribe: withFilter(
        (payload, variables, context) => {
          RoleValidator.checkAndThrowError(
            context.authToken.realm_access.roles,
            READ_ROLES,
            "Generator",
            "GeneratorVehicleGenerated",
            PERMISSION_DENIED_ERROR_CODE,
            "Permission denied"
          );
          return pubsub.asyncIterator("GeneratorVehicleGenerated");
        },
        () => true
      )
    },
  }
};

// ==== Bridge de eventos backend -> GQL Subscriptions ====
const eventDescriptors = [
  {
    backendEventName: "GeneratorVehicleModified",
    gqlSubscriptionName: "GeneratorVehicleModified",
    dataExtractor: evt => evt.data
  },
  // NUEVOS:
  {
    backendEventName: "GeneratorStatus",
    gqlSubscriptionName: "GeneratorStatus",
    dataExtractor: evt => evt.data
  },
  {
    backendEventName: "GeneratorVehicleGenerated",
    gqlSubscriptionName: "GeneratorVehicleGenerated",
    dataExtractor: evt => evt.data
  }
];

eventDescriptors.forEach(descriptor => {
  broker.getMaterializedViewsUpdates$([descriptor.backendEventName]).subscribe(
    evt => {
      const payload = {};
      payload[descriptor.gqlSubscriptionName] = descriptor.dataExtractor ? descriptor.dataExtractor(evt) : evt.data;
      pubsub.publish(descriptor.gqlSubscriptionName, payload);
    },
    error => console.error(`Error listening ${descriptor.gqlSubscriptionName}`, error),
    () => console.log(`${descriptor.gqlSubscriptionName} listener STOPED.`)
  );
});
