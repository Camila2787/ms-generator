import { gql } from 'apollo-boost';

export const GeneratorVehicleListing = (variables) => ({
  query: gql`
    query GeneratorVehicleListing(
      $filterInput: GeneratorVehicleFilterInput
      $paginationInput: GeneratorVehiclePaginationInput
      $sortInput: GeneratorVehicleSortInput
    ) {
      GeneratorVehicleListing(
        filterInput: $filterInput
        paginationInput: $paginationInput
        sortInput: $sortInput
      ) {
        listing {
          id
          name
          active
        }
        queryTotalResultCount
      }
    }
  `,
  variables,
  fetchPolicy: 'network-only',
});

export const GeneratorVehicle = (variables) => ({
  query: gql`
    query GeneratorVehicle($id: ID!, $organizationId: String!) {
      GeneratorVehicle(id: $id, organizationId: $organizationId) {
        id
        name
        description
        active
        organizationId
        metadata {
          createdBy
          createdAt
          updatedBy
          updatedAt
        }
      }
    }
  `,
  variables,
  fetchPolicy: 'network-only',
});

export const GeneratorCreateVehicle = (variables) => ({
  mutation: gql`
    mutation GeneratorCreateVehicle($input: GeneratorVehicleInput!) {
      GeneratorCreateVehicle(input: $input) {
        id
        name
        description
        active
        organizationId
        metadata {
          createdBy
          createdAt
          updatedBy
          updatedAt
        }
      }
    }
  `,
  variables,
});

export const GeneratorDeleteVehicle = (variables) => ({
  mutation: gql`
    mutation GeneratorVehicleListing($ids: [ID]!) {
      GeneratorDeleteVehicles(ids: $ids) {
        code
        message
      }
    }
  `,
  variables,
});

export const GeneratorUpdateVehicle = (variables) => ({
  mutation: gql`
    mutation GeneratorUpdateVehicle($id: ID!, $input: GeneratorVehicleInput!, $merge: Boolean!) {
      GeneratorUpdateVehicle(id: $id, input: $input, merge: $merge) {
        id
        organizationId
        name
        description
        active
      }
    }
  `,
  variables,
});

export const onGeneratorVehicleModified = (variables) => ([
  gql`
    subscription onGeneratorVehicleModified($id: ID!) {
      GeneratorVehicleModified(id: $id) {
        id
        organizationId
        name
        description
        active
        metadata {
          createdBy
          createdAt
          updatedBy
          updatedAt
        }
      }
    }
  `,
  { variables },
]);

/* ======================
   NUEVO: control Start/Stop
   - Start: mutation
   - Stop:  query
   Estas constantes se usan desde las actions:
   client.mutate({ mutation: START_GENERATION_GQL })
   client.query({ query: STOP_GENERATION_GQL })
====================== */

export const START_GENERATION_GQL = gql`
  mutation {
    GeneratorStartGeneration {
      code
      message
    }
  }
`;

export const STOP_GENERATION_GQL = gql`
  query {
    GeneratorStopGeneration {
      code
      message
    }
  }
`;

// === Estado actual del generador (query de lectura) ===
export const GET_GENERATION_STATUS_GQL = gql`
  query {
    GeneratorGenerationStatus {
      isGenerating
      generatedCount
      status
    }
  }
`;

// === Subscription: estado del generador (corriendo/contador) ===
export const ON_GENERATOR_STATUS = gql`
  subscription {
    GeneratorStatus {
      isGenerating
      generatedCount
      status
    }
  }
`;

// === Subscription: vehículo generado en tiempo real ===
export const ON_GENERATOR_VEHICLE_GENERATED = gql`
  subscription {
    GeneratorVehicleGenerated {
      at
      et
      aid
      timestamp
      data {
        type
        powerSource
        hp
        year
        topSpeed
      }
    }
  }
`;
