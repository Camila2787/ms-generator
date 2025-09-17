"use strict";

const { empty, Observable } = require("rxjs");

const VehicleCRUD = require("./VehicleCRUD")();
const VehicleES = require("./VehicleES")();
const DataAcess = require("./data-access/");

module.exports = {
  /**
   * domain start workflow
   */
  start$: DataAcess.start$,
  /**
   * start for syncing workflow
   * @returns {Observable}
   */
  startForSyncing$: DataAcess.start$,
  /**
   * start for getting ready workflow
   * @returns {Observable}
   */
  startForGettingReady$: empty(),
  /**
   * Stop workflow
   * @returns {Observable}
   */
  stop$: DataAcess.stop$,
  /**
   * @returns {VehicleCRUD}
   */
  VehicleCRUD: VehicleCRUD,
  /**
   * CRUD request processors Map
   */
  cqrsRequestProcessorMap: VehicleCRUD.generateRequestProcessorMap(),
  /**
   * @returns {VehicleES}
   */
  VehicleES,
  /**
   * EventSoircing event processors Map
   */
  eventSourcingProcessorMap: VehicleES.generateEventProcessorMap(),
};
