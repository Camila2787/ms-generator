import { defer } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';

import graphqlService from '../../../../services/graphqlService';
import { GeneratorVehicleListing, GeneratorDeleteVehicle } from '../../gql/Vehicle';

export const SET_VEHICLES = '[VEHICLE_MNG] SET VEHICLES';
export const SET_VEHICLES_PAGE = '[VEHICLE_MNG] SET VEHICLES PAGE';
export const SET_VEHICLES_ROWS_PER_PAGE = '[VEHICLE_MNG] SET VEHICLES ROWS PER PAGE';
export const SET_VEHICLES_ORDER = '[VEHICLE_MNG] SET VEHICLES ORDER';
export const SET_VEHICLES_FILTERS_ORGANIZATION_ID = '[VEHICLE_MNG] SET VEHICLES FILTERS ORGANIZATION_ID';
export const SET_VEHICLES_FILTERS_NAME = '[VEHICLE_MNG] SET VEHICLES FILTERS NAME';
export const SET_VEHICLES_FILTERS_ACTIVE = '[VEHICLE_MNG] SET VEHICLES FILTERS ACTIVE';

/**
 * Common function to generate the arguments for the GeneratorVehicleListing query based on the user input
 * @param {Object} queryParams 
 */
function getListingQueryArguments({ filters: { name, organizationId, active }, order, page, rowsPerPage }) {
    const args = {
        "filterInput": { organizationId },
        "paginationInput": { "page": page, "count": rowsPerPage, "queryTotalResultCount": (page === 0) },
        "sortInput": order.id ? { "field": order.id, "asc": order.direction === "asc" } : undefined
    };
    if (name.trim().length > 0) {
        args.filterInput.name = name;
    }
    if (active !== null) {
        args.filterInput.active = active;
    }
    return args;
}

/**
 * Queries the Vehicle Listing based on selected filters, page and order
 * @param {{ filters, order, page, rowsPerPage }} queryParams
 */
export function getVehicles({ filters, order, page, rowsPerPage }) {
    const args = getListingQueryArguments({ filters, order, page, rowsPerPage });    
    return (dispatch) => graphqlService.client.query(GeneratorVehicleListing(args)).then(result => {
        return dispatch({
            type: SET_VEHICLES,
            payload: result.data.GeneratorVehicleListing
        });
    })
}

/**
 * Executes the mutation to remove the selected rows
 * @param {*} selectedForRemovalIds 
 * @param {*} param1 
 */
export function removeVehicles(selectedForRemovalIds, { filters, order, page, rowsPerPage }) {
    const deleteArgs = { ids: selectedForRemovalIds };
    const listingArgs = getListingQueryArguments({ filters, order, page, rowsPerPage });
    return (dispatch) => defer(() => graphqlService.client.mutate(GeneratorDeleteVehicle(deleteArgs))).pipe(
        mergeMap(() => defer(() => graphqlService.client.query(GeneratorVehicleListing(listingArgs)))),
        map((result) =>
            dispatch({
                type: SET_VEHICLES,
                payload: result.data.GeneratorVehicleListing
            })
        )
    ).toPromise();
}

/**
 * Set the listing page
 * @param {int} page 
 */
export function setVehiclesPage(page) {
    return {
        type: SET_VEHICLES_PAGE,
        page
    }
}

/**
 * Set the number of rows to see per page
 * @param {*} rowsPerPage 
 */
export function setVehiclesRowsPerPage(rowsPerPage) {
    return {
        type: SET_VEHICLES_ROWS_PER_PAGE,
        rowsPerPage
    }
}

/**
 * Set the table-column order
 * @param {*} order 
 */
export function setVehiclesOrder(order) {
    return {
        type: SET_VEHICLES_ORDER,
        order
    }
}

/**
 * Set the name filter
 * @param {string} name 
 */
export function setVehiclesFilterName(name) {    
    return {
        type: SET_VEHICLES_FILTERS_NAME,
        name
    }
}

/**
 * Set the filter active flag on/off/both
 * @param {boolean} active 
 */
export function setVehiclesFilterActive(active) {
    return {
        type: SET_VEHICLES_FILTERS_ACTIVE,
        active
    }
}

/**
 * set the organizationId filter
 * @param {string} organizationId 
 */
export function setVehiclesFilterOrganizationId(organizationId) {    
    return {
        type: SET_VEHICLES_FILTERS_ORGANIZATION_ID,
        organizationId
    }
}



